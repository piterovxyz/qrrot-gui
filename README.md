# qrrot gui

a beautiful, cross-platform desktop client for the qrrot database, built using electron, react, and vite. it communicates directly with the database server using standard gRPC streaming.

---

## key features

- **glassmorphic design:** ultra-premium dark theme styled with custom vanilla CSS.
- **native file operations:** uses electron native dialogs for choosing files to upload and save locations.
- **in-app media previews:** view decrypted images, audio, and video streams directly inside the client workspace.
- **streaming chunk put/get:** streams data in 64kb chunks, avoiding gRPC message size limitations and tracking progress.
- **local index registry:** maintains a local index registry file mapping your uploaded keys and mime types for quick access.

---

## setup and execution

### 1. install dependencies

ensure node.js v18+ is installed:

```bash
npm install
```

### 2. run in development mode

start the vite development server:

```bash
npm run dev
```

in a separate terminal window, launch the electron app:

```bash
npm run electron:start
```

### 3. compile production build

generate the optimized web assets:

```bash
npm run build
```
