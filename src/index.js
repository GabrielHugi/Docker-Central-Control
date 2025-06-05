// controller.js
const express = require('express');
const Docker = require('dockerode');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// 1) Connec  t to the host Docker socket (/var/run/docker.sock)
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// 2) Configuration for “server” container
const SERVER_IMAGE = 'my-game-image:latest';
const SERVER_NAME  = 'dynamic_server';  // name by which we’ll reference it
const SERVER_PORT  = 4000;               // the port server.js listens on

let serverContainer = null; // will hold a Docker.Container object

// Helper: check if a container with name SERVER_NAME is already running
async function findExistingServer() {
  const containers = await docker.listContainers({ all: true });
  for (let info of containers) {
    if (info.Names.includes(`/${SERVER_NAME}`)) {
      // Found a container with that name
      return docker.getContainer(info.Id);
    }
  }
  return null;
}

// POST /start
// — expects a JSON body { username, password }
// — if credentials match, create + start the server container (unless it’s already running)
app.post('/start', async (req, res) => {
  const { username, password } = req.body;
  // Simple hardcoded creds (CHANGE this for production!)
  if (username !== 'admin' || password !== 'password') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    // 1. Check if it already exists
    let existing = await findExistingServer();
    if (existing) {
      const info = await existing.inspect();
      if (info.State.Running) {
        return res.status(400).json({ error: 'Server already running' });
      }
      // If it exists but is stopped, remove it before recreating
      await existing.remove({ force: true });
    }

    // 2. Pull the image (if not present) — ensures we have the image locally
    let imageList = await docker.listImages({ filters: { reference: [SERVER_IMAGE] } });
    if (imageList.length === 0) {
      console.log(`Pulling image ${SERVER_IMAGE}...`);
      await new Promise((resolve, reject) => {
        docker.pull(SERVER_IMAGE, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, onFinished, onProgress);

          function onFinished(err, output) {
            if (err) return reject(err);
            resolve(output);
          }
          function onProgress(event) {
            // optionally log progress
          }
        });
      });
      console.log(`Pulled ${SERVER_IMAGE}`);
    }

    // 3. Create (but do NOT start yet) with port mapping
    const container = await docker.createContainer({
      Image: SERVER_IMAGE,
      name: SERVER_NAME,
      ExposedPorts: { [`${SERVER_PORT}/tcp`]: {} },
      HostConfig: {
        PortBindings: {
          // map container’s 4000 → host 4000
          [`${SERVER_PORT}/tcp`]: [{ HostPort: `${SERVER_PORT}` }]
        }
      }
    });

    // 4. Start it
    await container.start();
    serverContainer = container;

    return res.json({ message: `server started on port ${SERVER_PORT}` });
  } catch (err) {
    console.error('Error in /start:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /stop
// — stops + removes the server container if it exists & is running
app.post('/stop', async (req, res) => {
  try {
    let existing = await findExistingServer();
    if (!existing) {
      return res.status(400).json({ error: 'No server container found' });
    }

    const info = await existing.inspect();
    if (info.State.Running) {
      await existing.stop({ t: 5 }); // give it 5s to gracefully stop
    }
    await existing.remove({ force: true });
    serverContainer = null;
    return res.json({ message: 'Server stopped and removed' });
  } catch (err) {
    console.error('Error in /stop:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /status
// — reports Running/Not Running
app.get('/status', async (req, res) => {
  try {
    const existing = await findExistingServer();
    if (!existing) {
      return res.json({ status: 'not-found' });
    }
    const info = await existing.inspect();
    return res.json({ status: info.State.Running ? 'running' : 'stopped' });
  } catch (err) {
    console.error('Error in /status:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Controller listening on port 3000');
});
