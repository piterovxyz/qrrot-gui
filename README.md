# qrrot gui

desktop gRPC client for the [qrrot](https://github.com/piterovxyz/qrrot) encrypted key-value database.

## features

- connect to any qrrot server via `grpc://` or `grpcs://`
- browse, search, upload & download encrypted entries
- in-app preview for images, video, audio, text, pdf
- streaming playback via custom `qrrot-media://` protocol
- drag & drop file uploads
- background task management with cancel support
- AES token-based encryption / decryption

## stack

| layer | tech |
|-------|------|
| framework | electron 42 |
| renderer | react 19 + vite 8 |
| ui | tailwind css (material 3 dark palette) |
| animations | framer motion |
| transport | @grpc/grpc-js + proto-loader |

## development

```bash
# install dependencies
npm install

# start vite dev server (renderer)
npm run dev

# start electron (in another terminal)
npm run electron:start

# run tests
npm test

# build for distribution
npm run dist
```

## project structure

```
├── main.js          # electron main process + gRPC handlers
├── preload.js       # context bridge (electronAPI)
├── src/
│   ├── App.jsx      # main react component
│   ├── main.jsx     # react entry point
│   ├── index.css    # tailwind + global styles
│   └── lib/
│       ├── fileUtils.jsx  # mime detection, icons, formatBytes
│       └── utils.js       # cn() utility (clsx + tailwind-merge)
├── proto/
│   └── qrrot.proto  # gRPC service definition
└── build/
    └── icon.png     # app icon
```
