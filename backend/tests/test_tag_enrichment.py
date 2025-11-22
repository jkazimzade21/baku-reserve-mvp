from backend.app.storage import DB


def test_all_restaurants_have_tag_groups():
    for record in DB.restaurants.values():
        tag_groups = record.get("tag_groups")
        assert tag_groups, f"missing tag_groups for {record.get('name')}"
        total = sum(len(values) for values in tag_groups.values())
        assert total >= 45, f"insufficient tags ({total}) for {record.get('name')}"
        flattened = set(record.get("tags", []))
        for values in tag_groups.values():
            for tag in values:
                assert (
                    tag in flattened
                ), f"tag {tag} missing from flattened tags for {record.get('name')}"
