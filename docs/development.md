# Building Pantera

Pantera is built with Expo (React Native). It uses native modules, so it needs its own build; Expo Go can't run it.

## You need

- Node.js (LTS), Python 3, and Android Studio with the Android SDK.
- About 15 GB of free space to build the food database.

## 1. Get the food data

The database is too large for this repository. Download these and place them as shown:

| Download | From | Place at |
|---|---|---|
| Open Food Facts `food.parquet` | [Open Food Facts data](https://world.openfoodfacts.org/data) | `search/data/downloads/off/food.parquet` |
| FoodData Central, Branded Foods (CSV) | [USDA downloads](https://fdc.nal.usda.gov/download-datasets) | unzip into `search/data/usda/branded/` |
| FoodData Central, SR Legacy (CSV) | same page | unzip into `search/data/usda/sr/` |
| FoodData Central, FNDDS survey foods (CSV) | same page | unzip into `search/data/usda/survey/` |

## 2. Build the database

```powershell
python -m venv search/.venv
```

```powershell
search/.venv/Scripts/pip install -r search/requirements.txt
```

```powershell
search/.venv/Scripts/python -m search.build
```

```powershell
search/.venv/Scripts/python -m search.mobile
```

This writes `assets/foods.db`. After changing the data for a new release, also run `python -m search.changes OLD.db` with the previous release's database, so that foods people saved can pick up corrected numbers.

## 3. Build the app

```powershell
npm install
```

```powershell
npx expo prebuild --platform android
```

```powershell
cd android; ./gradlew.bat app:assembleRelease
```

The release build is signed with Android's public debug key. Before sharing a build, sign it with your own key, which asks for your password:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sign-release.ps1 -In android/app/build/outputs/apk/release/app-release.apk -Out Pantera.apk
```

## Checks

```powershell
npm run typecheck
```

```powershell
node --no-experimental-strip-types -r ./tests/ts-require.cjs --test tests/app/*.test.ts
```

```powershell
node --test search/tests/*.test.mts
```

```powershell
search/.venv/Scripts/python -m unittest discover -s search/tests -t .
```

## Layout

- `src/app/`: screens (Expo Router).
- `src/foodIndex/`: search over the database inside the app.
- `src/meal/`: reading typed, spoken and photographed meals.
- `src/lookup.ts`: online barcode and name lookups.
- `search/`: scripts that build the food database.
- `plugins/`: Android build settings.

Cloud sync setup is described in [CLOUD_SETUP.md](../CLOUD_SETUP.md).
