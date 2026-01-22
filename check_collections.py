import weaviate

def check_weaviate():
    # According to .env, port is 8081
    try:
        client = weaviate.connect_to_local(
            host="localhost",
            port=8081,
            grpc_port=50051
        )
        if not client.is_live():
            print("Weaviate is not live at localhost:8081")
            return
            
        collections = client.collections.list_all()
        print(f"Found {len(collections)} total collections:")
        for name in collections.keys():
            coll = client.collections.get(name)
            try:
                count = coll.aggregate.over_all(total_count=True).total_count
                print(f"- {name} (Count: {count})")
            except Exception as e:
                print(f"- {name} (Error getting count: {e})")
        client.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    check_weaviate()
