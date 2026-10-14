# Rooftop Rumble

Online team hero brawler. Anyone with the link can play, with no accounts needed.

## Put it online (free, about 10 minutes)

You'll use two free sites: **GitHub** to hold the files and **Render** to run the game.

### 1. Upload the files to GitHub
1. Make a free account at https://github.com and sign in.
2. Click **+** (top right), then **New repository**. Name it `rooftop-rumble`, leave it **Public**, and click **Create repository**.
3. On the new repo page, click the **uploading an existing file** link.
4. Unzip `rooftop-rumble.zip`, open the folder, select everything inside it (`package.json`, `server.js`, `README.md` and the `public` folder; a hidden `.gitignore` file is optional), and drag it all onto the upload page. If the `public` folder won't drag in, drag `index.html` (from inside `public`) in by itself instead. The game works either way.
5. Click **Commit changes**.

### 2. Run it on Render
1. Make a free account at https://render.com. Signing up with your GitHub account is easiest.
2. Click **New**, then **Web Service**, and pick your `rooftop-rumble` repo. If it isn't listed, use the option to connect or configure your GitHub account and give Render access to it.
3. Check these settings:
   - **Language / Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Click **Create Web Service** (or **Deploy**) and wait a couple of minutes until it says **Live**.
5. Your game is at the link Render shows, something like `https://rooftop-rumble-xxxx.onrender.com`.

### 3. Play
1. Open your Render link, type a room code, and click **Copy invite link**.
2. Send that link to the boys. It opens with the room code already filled in.
3. Everyone clicks **Play online**, picks a team and a hero, and you're in.

## Good to know
- **First load can be slow.** The free server goes to sleep after 15 minutes with nobody on it. The first person to open the link wakes it up, which can take up to a minute. After that it's quick.
- **Up to 16 players per room.** Use different room codes for separate games.
- **Updating the game:** upload a new `public/index.html` to the GitHub repo (same steps, it replaces the old one). Render redeploys automatically.
- **Best on a computer** with a keyboard and mouse.

## Run it on your own computer (optional)
With Node.js installed, open a terminal in this folder and run:

```
npm install
npm start
```

Then open http://localhost:3000. Friends on the same Wi-Fi can join using your computer's local IP address, for example `http://192.168.1.20:3000`.
