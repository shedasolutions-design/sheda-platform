
import sys
import os

# Add root to python path
sys.path.append(os.getcwd())

from app.models.property import Property
from app.schemas.property_schema import PropertyBase, PropertyUpdate

def test_property_model():
    print("Testing Property Model...")
    try:
        # Check if the attribute exists on the class
        if hasattr(Property, 'blockchain_property_id'):
            print("âœ… Property model has 'blockchain_property_id' field.")
        else:
            print("âŒ Property model MISSING 'blockchain_property_id' field.")
            exit(1)
    except Exception as e:
        print(f"âŒ Error inspecting Property model: {e}")
        exit(1)

def test_property_creation_schema():
    print("\nTesting PropertyBase Schema...")
    try:
        # Instantiate with the new field
        data = {
            "title": "Test Prop",
            "description": "Desc",
            "location": "Loc",
            "price": 100.0,
            "property_type": "apartment",
            "listing_type": "rent",
            "status": "available",
            "furnished": True,
            "is_active": True,
            "bathroom": 1,
            "bedroom": 1,
            "air_condition": False,
            "pop_ceiling": False,
            "floor_tiles": False,
            "running_water": False,
            "furniture": False,
            "prepaid_meter": False,
            "wifi": False,
            "is_negotiable": False,
            "images": [],
            "blockchain_property_id": "block123"
        }
        prop = PropertyBase(**data)
        if prop.blockchain_property_id == "block123":
             print("âœ… PropertyBase accepted 'blockchain_property_id'.")
        else:
             print("âŒ PropertyBase did not store 'blockchain_property_id' correctly.")
             exit(1)
    except Exception as e:
        print(f"âŒ Error testing PropertyBase: {e}")
        exit(1)

def test_property_update_schema():
    print("\nTesting PropertyUpdate Schema...")
    try:
        data = {"blockchain_property_id": "new_block_id"}
        prop_update = PropertyUpdate(**data)
        if prop_update.blockchain_property_id == "new_block_id":
            print("âœ… PropertyUpdate accepted 'blockchain_property_id'.")
        else:
            print("âŒ PropertyUpdate did not store 'blockchain_property_id' correctly.")
            exit(1)
    except Exception as e:
        print(f"âŒ Error testing PropertyUpdate: {e}")
        exit(1)

if __name__ == "__main__":
    test_property_model()
    test_property_creation_schema()
    test_property_update_schema()
    print("\nâœ¨ All verification steps passed!")
