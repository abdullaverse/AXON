import random
import time
import requests

API = "http://127.0.0.1:8000/sensor-data"

scenario = "NORMAL"


def send(data):
    try:
        response = requests.post(API, json=data, timeout=2)

        if response.status_code == 200:
            print(
                f"[SENT] {data['node_id']} "
                f"{data['node_type']}"
            )

    except Exception:
        print("[NETWORK ERROR] Backend unavailable")


def landslide_node():
    if scenario == "LANDSLIDE":
        rainfall = random.randint(60, 95)
        soil = random.randint(78, 98)
        vibration = round(
            random.uniform(0.60, 0.95), 2
        )

    elif scenario == "CASCADE":
        rainfall = random.randint(70, 100)
        soil = random.randint(82, 98)
        vibration = round(
            random.uniform(0.65, 0.95), 2
        )

    else:
        rainfall = random.randint(5, 20)
        soil = random.randint(30, 50)
        vibration = round(
            random.uniform(0.01, 0.08), 2
        )

    return {
        "source": "SIMULATION",
        "node_id": "HILL_01",
        "node_type": "LANDSLIDE",

        "rainfall": rainfall,
        "soil_moisture": soil,
        "vibration": vibration,

        "temperature": random.randint(23, 31)
    }


def flood_node():
    if scenario == "FLOOD":
        water = random.randint(78, 98)
        rainfall = random.randint(60, 95)

    elif scenario == "CASCADE":
        water = random.randint(80, 99)
        rainfall = random.randint(70, 100)

    else:
        water = random.randint(25, 45)
        rainfall = random.randint(5, 20)

    return {
        "source": "SIMULATION",
        "node_id": "RIVER_01",
        "node_type": "FLOOD",

        "water_level": water,
        "rainfall": rainfall,

        "temperature": random.randint(24, 31)
    }


def fire_node():
    if scenario == "FIRE":
        temperature = random.randint(42, 55)
        humidity = random.randint(10, 25)
        smoke = random.randint(700, 1200)
        gas = random.randint(500, 900)

    else:
        temperature = random.randint(26, 33)
        humidity = random.randint(50, 75)
        smoke = random.randint(70, 150)
        gas = random.randint(60, 140)

    return {
        "source": "SIMULATION",
        "node_id": "FOREST_01",
        "node_type": "FOREST_FIRE",

        "temperature": temperature,
        "humidity": humidity,
        "smoke": smoke,
        "gas": gas
    }


def pollution_node():
    if scenario == "POLLUTION":
        pm25 = random.randint(160, 350)
        pm10 = random.randint(220, 500)
        gas = random.randint(450, 900)

    elif scenario == "FIRE":
        pm25 = random.randint(100, 250)
        pm10 = random.randint(150, 350)
        gas = random.randint(300, 650)

    else:
        pm25 = random.randint(15, 40)
        pm10 = random.randint(30, 70)
        gas = random.randint(70, 150)

    return {
        "source": "SIMULATION",
        "node_id": "AIR_01",
        "node_type": "POLLUTION",

        "pm25": pm25,
        "pm10": pm10,
        "gas": gas,

        "temperature": random.randint(25, 34),
        "humidity": random.randint(45, 75)
    }


def print_menu():
    print("\n==============================")
    print("       AXON DIGITAL TWIN")
    print("==============================")
    print("1 - NORMAL")
    print("2 - LANDSLIDE")
    print("3 - FLOOD")
    print("4 - FIRE")
    print("5 - POLLUTION")
    print("6 - CASCADE")
    print("7 - EXIT")
    print("==============================")


while True:

    print_menu()

    choice = input("Select scenario: ")

    if choice == "1":
        scenario = "NORMAL"

    elif choice == "2":
        scenario = "LANDSLIDE"

    elif choice == "3":
        scenario = "FLOOD"

    elif choice == "4":
        scenario = "FIRE"

    elif choice == "5":
        scenario = "POLLUTION"

    elif choice == "6":
        scenario = "CASCADE"

    elif choice == "7":
        break

    else:
        print("Invalid option")
        continue

    print(f"\nRunning scenario: {scenario}")

    for i in range(20):

        nodes = [
            landslide_node(),
            flood_node(),
            fire_node(),
            pollution_node()
        ]

        print(
            f"\nAXON STEP {i + 1} | "
            f"SCENARIO: {scenario}"
        )

        for node in nodes:
            send(node)
            print(node)

        time.sleep(2)