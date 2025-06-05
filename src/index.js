// controller.js
const express = require('express');
const Docker = require('dockerode');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());


const docker = new Docker({ socketPath: '/var/run/docker.sock' });            

let serverContainer = null;

async function findExistingServer() {
  const containers = await docker.listContainers({ all: true });
  for (let info of containers) {
    if (info.Names.includes(`/${SERVER_NAME}`)) {
      return docker.getContainer(info.Id);
    }
  }
  return null;
}

app.post('/start', async (req, res) => {
  const { username, password, image, restart } = req.body;
  if (!image || !username || !password) return res.status(400).json({error: "Missing stuff. Remember to add image name, username and password. Restart is optional."})
  const SERVER_IMAGE = image;
  const SERVER_NAME  = image;
  if (username !== 'admin' || password !== 'password') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    let existing = await findExistingServer();
    if (existing) {
      const info = await existing.inspect();
      if (info.State.Running) {
        return res.status(400).json({ error: 'Server already running' });
      }
      await existing.remove({ force: true });
    }

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
            // log game variables or something idk
            // mr johnny buttson was kileld by gamersigma3233
          }
        });
      });
      console.log(`Pulled ${SERVER_IMAGE}`);
    }

    const container = await docker.createContainer({
      Image: SERVER_IMAGE,
      name: SERVER_NAME,
      ExposedPorts: { [`${SERVER_PORT}/tcp`]: {} },
      HostConfig: {
        PortBindings: {
          [`${SERVER_PORT}/tcp`]: [{ HostPort: "" }]
        }
      }
    });

    await container.start();
    serverContainer = container;
    let info = await container.inspect();
    let port = info.NetworkSettings.Ports[`${INTERNAL_PORT}/tcp`][0].HostPort;
    return res.json({ message: `server started on port ${port}` });
  } catch (err) {
    console.error('Error in /start:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/stop', async (req, res) => {
  try {
    let existing = await findExistingServer();
    if (!existing) {
      return res.status(400).json({ error: 'No server container found' });
    }

    const info = await existing.inspect();
    if (info.State.Running) {
      await existing.stop({ t: 5 }); 
    }
    await existing.remove({ force: true });
    serverContainer = null;
    return res.json({ message: 'Server stopped and removed' });
  } catch (err) {
    console.error('Error in /stop:', err);
    return res.status(500).json({ error: err.message });
  }
});

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
