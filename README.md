# qrrot gui

desktop client for the qrrot database. built on electron, react, and vite.

## how it works

1. **grpc protocol:** the application interacts with the qrrot server via the grpc protocol. the api schema is loaded from the `proto/qrrot.proto` file.
2. **local registry:** the list of uploaded keys is saved locally in the `qrrot_registry.json` file in the application's working directory (`userdata`).
3. **streaming:** file writing and reading are carried out in 64 kb chunks via grpc streams (`put` and `get` requests), which eliminates grpc limitations on the maximum message size.
4. **file viewing:** playback and preview of media files (images, audio, video, text) are supported directly in the interface after their decryption.

## installation and startup

### 1. installing dependencies

requires node.js v18+:

```bash
npm install
```

### 2. running in development mode

start the vite server:

```bash
npm run dev
```

in another terminal, start electron:

```bash
npm run electron:start
```

### 3. testing

running vitest tests:

```bash
npm test
```

### 4. building the application

building optimized frontend resources:

```bash
npm run build
```

building the ready-to-use application distribution for the current platform (electron-builder):

```bash
npm run dist
```