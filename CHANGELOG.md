# Reef Keeper v2.0.1 – My Tank Cleanup

## Changed files
- `index.html`
- `app.js`

## Changes
- Removed the large My Tank intro/hero panel.
- Removed Tank Score from the My Tank tab.
- Removed the large My Tank tiles.
- Moved Fish / Coral / Equip. / Params into a sticky bottom selector inside My Tank.
- Shortened Equipment label to `Equip.` so it fits on mobile.
- Fish now opens Livestock Catalog on the Fish tab.
- Coral now opens Livestock Catalog on the Coral tab.
- Livestock catalog cards now expand using the tapped card element, avoiding fragile generated IDs.

## Test checklist
- My Tank opens without the old intro panel.
- The sticky Fish / Coral / Equip. / Params selector appears at the bottom.
- Fish opens the Livestock Catalog on Fish.
- Coral opens the Livestock Catalog on Coral.
- Fish cards expand when tapped.
- Invert and coral cards still expand.
- Equip. opens Equipment.
- Params opens parameter logging.
