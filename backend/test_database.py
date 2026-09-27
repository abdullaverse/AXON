from backend.database import test_connection


print("============================")
print(" AXON DATABASE CONNECTION")
print("============================")

try:

    nodes = test_connection()

    print("SUPABASE CONNECTED")
    print()

    for node in nodes:
        print(
            node["node_code"],
            "->",
            node["node_type"]
        )

except Exception as error:

    print("CONNECTION FAILED")
    print(error)