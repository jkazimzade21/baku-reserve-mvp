# Curated Instagram Photo Sources

This directory stores the raw Instagram photos you pull per restaurant.  
Drop JPEG/PNG assets into subfolders named after the restaurant slug (e.g. `sumakh/1.jpg`, `chinar/1.jpg`, ...).  
Once the photos are in place, run:

```
source .venv/bin/activate
python tools/update_restaurant_photos.py --download    # fetch via URLs in PHOTO_SOURCES (optional)
python tools/update_restaurant_photos.py              # convert existing files + regenerate manifest
```

The helper script converts everything under `IGPics/<slug>/` into WebP assets inside
`mobile/src/assets/restaurants/<slug>/`, rebuilds `restaurantPhotoManifest.ts`, and
rewrites `backend/app/data/restaurants.json` so the API exposes `/assets/restaurants/<slug>/<n>.jpg`
for each venue. FastAPI automatically serves this folder via `/assets/restaurants`.

If Instagram blocks an automatic download, save the image manually into the appropriate
`IGPics/<slug>/` subfolder and rerun `python tools/update_restaurant_photos.py`.
Always keep the files numbered (1–5) so both the API and mobile manifest stay in sync.
