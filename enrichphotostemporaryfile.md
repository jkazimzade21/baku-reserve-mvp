How I enriched photos for `happymoonscafebaku`

1) Identify slug and Instagram handle  
   - Found slug in `backend/app/data/restaurants.json` (`"slug": "happymoonscafebaku"`).  
   - Instagram URL: `https://www.instagram.com/happymoonscafebaku/`.

2) Fetch recent photo URLs (no login)  
   - Called Instagram public web API:  
     `https://www.instagram.com/api/v1/users/web_profile_info/?username=happymoonscafebaku`  
   - Added headers: `User-Agent: Chrome ...` and `X-IG-App-ID: 936619743392459`.  
   - Parsed `edge_owner_to_timeline_media.edges` and collected the first few `display_url` values, skipping videos.

3) Download selected images  
   - Downloaded 6 photos (mix of food, drinks, interior) via `requests.get(display_url, headers=UA)`.  
   - Saved raw JPGs to `photos/IGPics/happymoonscafebaku/1.jpg` .. `6.jpg`.

4) Convert to webp for the app bundle  
   - Used Pillow to convert each JPG to RGB and save as WEBP (quality 90):  
     output path `mobile/src/assets/restaurants/happymoonscafebaku/<n>.webp`.

5) Wire into the app manifest  
   - Added a bundle entry in `mobile/src/assets/restaurantPhotoManifest.ts` referencing the 6 webp files so the mobile app loads them locally.

6) Result  
   - Happy Moon’s now renders real photos offline/online, no fallback deck needed.  
   - Raw sources remain in `photos/IGPics/happymoonscafebaku/` for traceability.
