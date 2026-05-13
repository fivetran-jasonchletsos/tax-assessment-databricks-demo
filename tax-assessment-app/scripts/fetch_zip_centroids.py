"""
Build scripts/zip_centroids.json — lat/lng for every Allegheny County ZIP.

Free public source: https://api.zippopotam.us/us/<zip>. Cached so the
snapshot builder doesn't re-hit the API on every run.
"""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ALLEGHENY_ZIPS = [
    15003, 15005, 15006, 15007, 15012, 15014, 15015, 15017, 15018, 15020,
    15024, 15025, 15026, 15028, 15030, 15031, 15034, 15035, 15037, 15044,
    15045, 15046, 15047, 15049, 15051, 15056, 15057, 15063, 15064, 15065,
    15068, 15071, 15075, 15076, 15082, 15083, 15084, 15085, 15086, 15088,
    15089, 15090, 15101, 15102, 15104, 15106, 15107, 15108, 15110, 15112,
    15116, 15120, 15122, 15126, 15129, 15131, 15132, 15133, 15135, 15136,
    15137, 15139, 15140, 15142, 15143, 15144, 15145, 15146, 15147, 15148,
    15201, 15202, 15203, 15204, 15205, 15206, 15207, 15208, 15209, 15210,
    15211, 15212, 15213, 15214, 15215, 15216, 15217, 15218, 15219, 15220,
    15221, 15222, 15223, 15224, 15225, 15226, 15227, 15228, 15229, 15232,
    15233, 15234, 15235, 15236, 15237, 15238, 15239, 15241, 15243,
]

OUT = Path(__file__).resolve().parent / "zip_centroids.json"


def fetch(z: int) -> tuple[float, float] | None:
    try:
        with urllib.request.urlopen(f"https://api.zippopotam.us/us/{z:05d}", timeout=10) as r:
            d = json.loads(r.read())
        places = d.get("places", [])
        if not places:
            return None
        p = places[0]
        return float(p["latitude"]), float(p["longitude"])
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, KeyError) as e:
        print(f"  {z}: {e}")
        return None


def main():
    existing: dict[str, list[float]] = {}
    if OUT.exists():
        existing = json.loads(OUT.read_text())

    missing = [z for z in ALLEGHENY_ZIPS if str(z) not in existing]
    print(f"Need {len(missing)} new centroids, {len(existing)} already cached")

    for i, z in enumerate(missing):
        coords = fetch(z)
        if coords:
            existing[str(z)] = [coords[0], coords[1]]
            print(f"  [{i + 1}/{len(missing)}] {z}: {coords[0]:.4f}, {coords[1]:.4f}")
        time.sleep(0.2)  # be polite

    OUT.write_text(json.dumps(existing, indent=2, sort_keys=True))
    print(f"\nWrote {len(existing)} centroids to {OUT}")


if __name__ == "__main__":
    main()
