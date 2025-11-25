# AUTOMATED PHOTO CURATION

## The Challenge
Many restaurants post menus, flyers, posters, or text-heavy announcements on their Instagram feeds.
Automatically fetching the "latest" posts often results in low-quality imagery (e.g., a menu instead of food).

## The Solution
We have implemented an **Automated Alt-Text Filtering** system in `tools/update_restaurant_photos.py`.

### Algorithm
When fetching photos from a restaurant's profile:
1.  The script retrieves recent posts.
2.  It inspects the `accessibility_caption` (Alt Text) provided by Instagram's AI.
3.  It **rejects** posts containing keywords like:
    *   `text`
    *   `poster`
    *   `menu`
    *   `graphic`
    *   `font`
    *   `drawing`
4.  It **prioritizes** (implicitly, by filtering) posts that are likely photos of food, interiors, or people.

### How to Use
1.  Ensure `tools/update_restaurant_photos.py` is updated with the filtering logic.
2.  Add the restaurant's profile URL to `PHOTO_SOURCES` in the script (or ensure it's in `restaurants.json` with an `instagram` field).
3.  Run the update script:
    ```bash
    python3 tools/update_restaurant_photos.py --download --slugs yanardag_restaurant
    ```

### Manual Override
If the automated filter is too strict or fails to find enough photos, you can still manually curate the list of URLs in `tools/update_restaurant_photos.py` as described in `PHOTO_CURATION.md` (legacy method).
