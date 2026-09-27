import heapq
from math import radians, sin, cos, sqrt, atan2


# ============================================================
# AXON PROTOTYPE EVACUATION NETWORK
# Later this graph will come from real map road data.
# ============================================================

NODES = {
    "VILLAGE": (12.2250, 79.0750),

    "J1": (12.2260, 79.0740),
    "J2": (12.2270, 79.0730),
    "J3": (12.2240, 79.0730),
    "J4": (12.2230, 79.0760),

    "SP_01": (12.2280, 79.0720),
    "SP_02": (12.2220, 79.0720),
    "SP_03": (12.2220, 79.0780),
}


# Road graph
GRAPH = {
    "VILLAGE": ["J1", "J3", "J4"],

    "J1": ["VILLAGE", "J2"],
    "J2": ["J1", "SP_01"],

    "J3": ["VILLAGE", "SP_02"],

    "J4": ["VILLAGE", "SP_03"],

    "SP_01": ["J2"],
    "SP_02": ["J3"],
    "SP_03": ["J4"],
}


SAFE_POINTS = [
    "SP_01",
    "SP_02",
    "SP_03"
]


# ============================================================
# DISTANCE
# ============================================================

def distance(a, b):

    lat1, lon1 = NODES[a]
    lat2, lon2 = NODES[b]

    R = 6371.0

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    x = (
        sin(dlat / 2) ** 2
        +
        cos(radians(lat1))
        *
        cos(radians(lat2))
        *
        sin(dlon / 2) ** 2
    )

    return 2 * R * atan2(
        sqrt(x),
        sqrt(1 - x)
    )


# ============================================================
# HAZARD → UNSAFE ROAD MAPPING
# ============================================================

def blocked_edges(hazards):

    blocked = set()

    landslide = (
        hazards.get("landslide") or {}
    ).get("risk", 0)

    flood = (
        hazards.get("flood") or {}
    ).get("risk", 0)

    fire = (
        hazards.get("fire") or {}
    ).get("risk", 0)

    # Prototype geospatial mapping:
    # these are demo road-hazard relationships.

    if landslide >= 60:

        blocked.add(
            frozenset(("J1", "J2"))
        )

        blocked.add(
            frozenset(("J2", "SP_01"))
        )

    if flood >= 60:

        blocked.add(
            frozenset(("J3", "SP_02"))
        )

    if fire >= 60:

        blocked.add(
            frozenset(("J4", "SP_03"))
        )

    return blocked


# ============================================================
# DIJKSTRA SAFE PATH
# ============================================================

def shortest_safe_path(
    start,
    destination,
    blocked
):

    queue = [
        (0, start, [start])
    ]

    visited = set()

    while queue:

        cost, node, path = heapq.heappop(
            queue
        )

        if node == destination:

            return cost, path

        if node in visited:
            continue

        visited.add(node)

        for neighbour in GRAPH.get(
            node, []
        ):

            edge = frozenset(
                (node, neighbour)
            )

            # Hazard blocks this road
            if edge in blocked:
                continue

            new_cost = (
                cost
                +
                distance(
                    node,
                    neighbour
                )
            )

            heapq.heappush(
                queue,
                (
                    new_cost,
                    neighbour,
                    path + [neighbour]
                )
            )

    return None, None


# ============================================================
# CHOOSE SAFEST REACHABLE SHELTER
# ============================================================

def calculate_safe_route(
    hazards,
    start="VILLAGE"
):

    blocked = blocked_edges(
        hazards
    )

    routes = []

    for safe_point in SAFE_POINTS:

        cost, path = shortest_safe_path(
            start,
            safe_point,
            blocked
        )

        if path is not None:

            routes.append({
                "safe_point":
                    safe_point,

                "distance_km":
                    round(cost, 3),

                "path":
                    path
            })

    if not routes:

        return {
            "status":
                "NO_SAFE_ROUTE",

            "message":
                "All known evacuation corridors "
                "are affected by hazards.",

            "blocked_roads":
                [
                    list(x)
                    for x in blocked
                ]
        }

    # Closest reachable SAFE point
    best = min(
        routes,
        key=lambda x:
            x["distance_km"]
    )

    return {
        "status":
            "SAFE_ROUTE_FOUND",

        "destination":
            best["safe_point"],

        "distance_km":
            best["distance_km"],

        "path":
            best["path"],

        "blocked_roads":
            [
                list(x)
                for x in blocked
            ],

        "alternatives":
            routes
    }