const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'build')
const outputFile = path.join(outputDir, 'tokscale.exe')

const candidates = [
  path.join(projectRoot, 'node_modules', '@tokscale', 'cli-win32-x64-msvc', 'bin', 'tokscale.exe'),
  path.join(projectRoot, 'node_modules', 'tokscale', 'node_modules', '@tokscale', 'cli-win32-x64-msvc', 'bin', 'tokscale.exe'),
  process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'tokscale', 'node_modules', '@tokscale', 'cli-win32-x64-msvc', 'bin', 'tokscale.exe')
    : '',
].filter(Boolean)

const source = candidates.find((candidate) => fs.existsSync(candidate))

if (!source) {
  throw new Error('未找到 tokscale.exe，请先执行 npm install，确保 @tokscale/cli-win32-x64-msvc 已安装。')
}

fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(source, outputFile)

console.log(`[prepare:tokscale] copied ${source} -> ${outputFile}`)
