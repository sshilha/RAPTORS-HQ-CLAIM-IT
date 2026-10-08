# Raptors Training Scheduler — Deployment POC

A minimal working Express application for GitHub + Railway. This version does **not** authenticate users, read SportsEngine data, or accept reservations.

## Deploy with your existing GitHub/Railway connection

1. Download and extract the ZIP.
2. Upload **the files inside** `raptors-training-starter` to the root of your existing `RAPTORS-HQ-TRAINING-SCHEDULER` GitHub repository (alongside or replacing its README).
3. Commit changes to the branch Railway deploys. Railway should automatically rebuild.
4. In Railway, open your service's **Settings → Networking → Generate Domain** to get a public URL.
5. Open the URL. The landing page should appear. Check `/health` for a JSON `status: ok` response.

Railway should detect Node.js from `package.json` and run `npm start`. No environment variables or database are needed for this proof of concept.

## Local run

```bash
npm install
npm start
```

Visit http://localhost:3000 and http://localhost:3000/health.

## Security boundary

A private SportsEngine page can link here, but it does not securely authenticate the user to this app. Do not collect personal information or accept reservations until server-side authentication and authorization are implemented.
