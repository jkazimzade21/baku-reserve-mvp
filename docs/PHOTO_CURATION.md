# Restaurant Photo Curation Guide

## Problem
Some restaurants have poor quality photos when automatically fetched from their Instagram profile (e.g., menus, people, flyers). These restaurants are currently hidden from the discovery UI in the mobile app.

## Solution: Manual Curation
To ensure high-quality images (food, interior, drinks), we must manually select specific Instagram posts for these restaurants instead of relying on the latest posts.

## Workflow

### 1. Identify the Restaurant
Check `mobile/src/constants/hiddenRestaurants.ts` for the list of hidden restaurants.
Example: `yanardag_restaurant`.

### 2. Select Photos
1.  Visit the restaurant's Instagram profile (e.g., https://www.instagram.com/yanardag_restaurant/).
2.  Browse their feed and select 5 high-quality images. Look for:
    *   Plated food (well-lit, appetizing).
    *   Interior/Exterior shots (ambiance).
    *   Drinks/Cocktails.
    *   **Avoid:** Menus, flyers, blurry photos, photos of people/crowds only.
3.  Copy the URL of each selected post (e.g., `https://www.instagram.com/p/Cb1_ESkAlzh/`).

### 3. Update the Tool
1.  Open `tools/update_restaurant_photos.py`.
2.  Find the `PHOTO_SOURCES` dictionary.
3.  Add an entry for the restaurant slug with the list of selected URLs.

```python
    "yanardag_restaurant": [
        "https://www.instagram.com/p/SHORTCODE1/",
        "https://www.instagram.com/p/SHORTCODE2/",
        "https://www.instagram.com/p/SHORTCODE3/",
        "https://www.instagram.com/p/SHORTCODE4/",
        "https://www.instagram.com/p/SHORTCODE5/",
    ],
```

### 4. Fetch and Process
Run the update script to download and convert the images:

```bash
python3 tools/update_restaurant_photos.py --download --slugs yanardag_restaurant
```

*Note: You may need to log in if the posts are age-restricted or if Instagram rate-limits you. Use the `--login` flag.*

### 5. Unhide the Restaurant
1.  Open `mobile/src/constants/hiddenRestaurants.ts`.
2.  Remove the restaurant ID from the `HIDDEN_DISCOVERY_IDS` list.
3.  Verify in the mobile app that the restaurant now appears with the correct photos.

## Maintenance
If a restaurant changes its menu or interior, or if the photos feel stale, repeat this process to update the list of URLs.
