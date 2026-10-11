# The Haunted Mansion — Book Nook

An interactive 3D book-nook diorama of the Haunted Mansion ride, built entirely in the browser with three.js. The mansion sits on a bookshelf between giant leather books and a lit candle. The walls facing you melt away so you can see into every room, the residents react when you poke them, and a Doom Buggy will take you through the whole house in first person.

**▶ Visit the nook: <https://nacdwk.github.io/haunted-mansion-nook/>**

*An unofficial fan tribute. The music, sound and narration are original and generated in code. The artwork is too, apart from the Stretching Room's portraits and wallpaper and the Endless Hall's wallpaper (see [Credits](#credits)).*

![The open nook](docs/overview.jpg)

## What's inside

| | |
|---|---|
| ![The closed mansion](docs/closed.jpg) | ![A storm over the nook](docs/storm.jpg) |
| ![The séance circle](docs/seance.jpg) | ![The graveyard](docs/graveyard.jpg) |

**Nine rooms and the grounds**

- **Stretching Room** (the tower): its portraits stretch to reveal the dynamite keg, the crocodile under the tightrope, the gentlemen sinking in quicksand and the widow perched on George's headstone.
- **Library:** marble busts that turn to watch you, books that fly like birds, a ghost reading by the fire, and a portrait that ages when you look closer.
- **Endless Hallway:** a forced-perspective corridor with a floating candelabra, plus doors that knock and bulge and a clock that strikes thirteen.
- **Conservatory:** wilted plants, a raven, and a coffin whose occupant would like to get out.
- **Séance Circle:** the medium's face glows in a crystal ball while instruments orbit the table and the chairs rattle.
- **Grand Hall:** waltzing couples, a hooded organist with banshees rising from the pipes, a birthday table, a ghost swinging from the chandelier and duelling portraits.
- **Attic:** a bride with a beating heart, wedding portraits that keep losing their grooms, a shadow at the piano and ghosts popping out of trunks.
- **Portrait Hall** (below stairs): portraits that turn monstrous when the lightning strikes, and the Doom Buggy load area.
- **Grounds:** a hearse pulled by an invisible horse, a pet cemetery, five singing busts, the caretaker and his trembling dog, a tea party, a royal teeter-totter, and three hitchhikers waiting at their crypt. The soil under the graveyard is cut away to show who is buried there.

| | | |
|---|---|---|
| ![Inside the Stretching Room](docs/stretching-room.jpg) | ![The Endless Hallway](docs/endless-hall.jpg) | ![Lantern light in the library](docs/lantern.jpg) |

## Things to try

- **Ride:** board a Doom Buggy. The ride starts in the Stretching Room, travels through every room with a ghost host narrating, drops backwards out of the attic into the graveyard, and ends at a mirror. Check who is sitting next to you.
- **Lantern:** the lights go out and your cursor becomes a lantern. Nine hidden haunts only show up in its glow. Find all nine for a surprise.
- **Storm:** rain and lightning roll in.
- **Close up / Open up:** put the facade back to see the mansion from outside, or melt it away again.
- **Click any room** to fly in. The side panel lists what you can do there, or click the residents directly.
- **Sound:** everything you hear is synthesized live: wind, owls, thunder, an original waltz in D minor whose instrument changes from room to room (organ, music box, theremin, and the busts as a five-voice choir), and dozens of sound effects.

![The Grand Hall, focused](docs/grand-hall.jpg)

### Controls

| Input | Action |
|---|---|
| Drag | Turn the nook |
| Scroll / pinch | Lean in or out |
| Click | Visit a room, or poke a resident |
| `R` | Ride the Doom Buggy |
| `L` | Lantern |
| `S` | Storm |
| `O` | Open or close the house |
| `M` | Sound on or off |
| `←` `→` | Previous or next room |
| `Esc` | Back out of a room, or leave the ride |

## Running it locally

It's a static site made of ES modules, so it needs to be served over HTTP rather than opened as a file:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. You need a browser with WebGL and an internet connection, because three.js (r170) and the two fonts load from CDNs.

On `localhost` you can skip the title card while developing: `?autoenter` enters straight away, and you can add `&focus=ballroom` (any room id) or `&ride`.

## How it's built

Apart from the Grand Hall's baked set and the portraits and wallpaper listed under [Credits](#credits), there are no image, model or audio files. Every mesh is built from primitives, every texture (wallpapers, wood, slate, soil strata, all the portraits, the faces in the crystal ball and on the busts) is painted onto canvases at load time, and all sound is generated with the Web Audio API.

| File | What it does |
|---|---|
| `js/main.js` | Boots the renderer, camera, lights and frame loop, and assembles the world |
| `js/core.js` | Shared state, helpers, geometry merging, the dissolving-wall shader and the ghost shader |
| `js/tex.js`, `js/paint.js` | Procedural textures and the painted portraits and faces |
| `js/materials.js` | Builds every texture and shared material once |
| `js/house.js` | Plinth and basement, the mansion shell, mansard attic, levitating roof, stretching tower, bookshelf |
| `js/rooms.js` | Every interior room, its residents and interactions |
| `js/outside.js` | Front lawn, hearse, graveyard, crypt, sky, bats, fog |
| `js/props.js` | Reusable props: candles, chandeliers, bookshelves, busts, coffins, ravens, trees… |
| `js/ride.js` | The track, the Doom Buggies and the first-person ride with the mirror finale |
| `js/fx.js` | Lightning, rain, the lantern and the hidden-haunt hunt |
| `js/audio.js` | The synthesizer, the score and sound effects |
| `js/post.js` | Bloom, tilt-shift miniature blur and colour grade |
| `js/ui.js` | Picking, hover labels, room panels, the dock, captions and the ride overlay |
| `js/baked.js` | Loads the Blender-built Grand Hall and draws it with its baked light |
| `js/art.js` | Swaps in the official Stretching Room portraits and wallpaper and the Endless Hall wallpaper from `assets/art/`, when those files are present |
| `tools/prepare_art.py` | Crops the portraits, cuts a seamless tile of the Endless Hall wallpaper and redraws the Stretching Room's stripes from the source images into `assets/art/` |
| `blender/` | The Blender script that models and light-bakes the Grand Hall, and `bake.sh` to rebuild `assets/` |

A few techniques keep it running at 60 fps:

- Static geometry is merged into one mesh per material. Animated props are tagged so they survive merging with their own transforms intact.
- The shadow map is redrawn only when the architecture moves (walls dissolving, the roof lifting, the tower stretching), and small moving props don't cast shadows.
- All candle flames are drawn as three instanced meshes.
- Lights are never added, removed or hidden after start-up, because that would force every shader to recompile.
- The facade melts with a 3D-noise dissolve shader whose edges glow like ectoplasm.
- In the mirror, the hitchhiker is switched on only for the reflection's render pass, so you can see him in the glass but not beside you.

## The baked Grand Hall (experiment)

![The Grand Hall, procedural and baked](docs/grand-hall-baked.jpg)

On this branch the Grand Hall's set is modelled in Blender and lit with Cycles instead of being built from primitives at load time. The new set has a coffered ceiling, fluted gilt pilasters, raised panels, dentil cornices, turned balusters on the gallery, a veined marble fireplace with a mirror overmantel, a pipe organ with a three-manual console, an inlaid parquet floor with a star medallion, curtained windows and wall sconces. The residents, the chandelier, the cake and the portraits are still the procedural ones.

- `blender/grand_hall.py` builds the set and removes faces nobody can see. It then bakes two lightmaps: warm (chandelier, candles, fire) and cool (moonlight, the ghosts' glow, and the house's sky and fill light with ambient occlusion). Finally it exports Draco-compressed geometry.
- `js/baked.js` draws the set with one cheap shader. It reads the lightmaps, maps the site's painted textures onto the surfaces and adds the lantern. Polished floors and marble show glints of the flames, and gilt gets a fake reflection.
- Because the two lightmaps are separate, the hall still dims for the lantern, brightens on hover, flickers with the fire and flashes with lightning. Its wall dressing melts away with the facades.
- Rebuild with `blender/bake.sh --size 2048 --samples 256`, which takes about 40 seconds on an M4 GPU. To compare, add `?baked=0` to the URL for the procedural hall. If the baked files fail to load, the site falls back to the procedural hall on its own.

Measured in headless Chrome on an M4 MacBook, against the same views in the procedural version:

| | Procedural | Baked |
|---|---|---|
| Download for the whole page (cache off) | 683 KB | 1,293 KB (+610 KB: 496 KB of model and lightmaps, ~100 KB of glTF/Draco loaders) |
| GPU time per frame at Retina size, whole hall in view | 13.5–15.9 ms | 13.4–14.2 ms |
| GPU time per frame at Retina size, close-up of the hall | 13.0–13.9 ms | 7.2–8.0 ms |
| GPU time per frame at Retina size, riding through the hall | 51.2 ms | 43.4 ms |
| Draw calls (with shadow pass) / triangles | 659 / 248k | 668 / 274k |

The baked hall has more geometry but costs less to draw where it fills the screen, because its surfaces don't add up a dozen point lights for every pixel. The price is download size.

## Credits

- The four Stretching Room portraits are Disney's paintings of the attraction's stretching portraits, taken from Disney Store product images (© Disney).
- The Endless Hall's wallpaper is Panicked Pixie's recreation of the attraction's wallpaper, from their Redbubble listing, after Disney's original design.
- The Stretching Room's striped wallpaper is redrawn from a photo of the attraction's own wallpaper; its stripe colours are sampled from that photo.

These are used without permission in this non-commercial fan tribute. If you hold the rights to either and want them taken down, please open an issue. Deleting `assets/art/` puts the house's own painted portraits, its original eye-damask wallpaper and its own striped wallpaper back in their place, and `?art=0` shows those versions now.

## Disclaimer

This is an unofficial, non-commercial fan tribute. It is not affiliated with, sponsored by or endorsed by The Walt Disney Company. "Haunted Mansion" and "Doom Buggy" are names associated with Disney's attraction and are used here only to describe what this diorama pays tribute to. Apart from the artwork listed under Credits, no Disney artwork, audio, lyrics or logos are included, and every other image, sound and line of narration in this repository is original.
