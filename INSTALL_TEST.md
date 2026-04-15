# Tokscale Floating Monitor 安装测试指南

## 安装包信息

- **文件名**: `Tokscale Floating Monitor-0.1.0-setup.exe`
- **大小**: 109 MB
- **生成时间**: 2026-04-15
- **位置**: `release/Tokscale Floating Monitor-0.1.0-setup.exe`

## 安装测试步骤

### 1. 安装过程验证

1. **启动安装程序**
   ```bash
   # 在项目目录下
   start release\Tokscale Floating Monitor-0.1.0-setup.exe
   ```

2. **验证安装向导**
   - [ ] 显示欢迎页面
   - [ ] 允许选择安装目录（非一键安装）
   - [ ] 显示安装进度
   - [ ] 显示完成页面

3. **自定义安装路径测试**
   - [ ] 安装到默认路径：`C:\Program Files\Tokscale Floating Monitor`
   - [ ] 安装到自定义路径：`D:\Apps\TokscaleMonitor`
   - [ ] 安装到含中文路径：`D:\软件\Tokscale监控`
   - [ ] 安装到含空格路径：`C:\My Programs\Tokscale Monitor`

### 2. 安装后验证

安装完成后，检查以下项目：

#### 文件系统检查
- [ ] 安装目录存在且包含以下文件：
  - `Tokscale Floating Monitor.exe` (主程序)
  - `resources/` 目录
  - `resources/tokscale.exe` (tokscale 二进制)
  - `tokscale.cmd` (命令行包装脚本)
  - `Uninstall.exe` (卸载程序)

#### 注册表检查
- [ ] PATH 环境变量已添加安装目录：
  ```powershell
  # PowerShell
  $env:PATH -split ';' | Select-String "Tokscale"
  ```
- [ ] 开机启动项已设置：
  ```powershell
  # PowerShell
  Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run -Name TokscaleFloatingMonitor
  ```

#### 快捷方式检查
- [ ] 开始菜单快捷方式：`开始菜单 > Tokscale Floating Monitor`
- [ ] 桌面快捷方式（如果安装时选择了）

### 3. 应用程序功能测试

1. **启动应用程序**
   - [ ] 从开始菜单启动
   - [ ] 从桌面快捷方式启动
   - [ ] 直接运行 `Tokscale Floating Monitor.exe`

2. **基本功能验证**
   - [ ] 悬浮窗显示（置顶、可拖动）
   - [ ] 系统托盘图标出现
   - [ ] 右键托盘菜单：显示/隐藏、刷新、检查更新、退出
   - [ ] 关闭窗口后应用程序仍在托盘运行

3. **面板数据加载测试**
   - [ ] Overview 面板：显示今日 token 使用统计
   - [ ] Models 面板：显示模型使用详情
   - [ ] Daily 面板：显示本周每日使用情况
   - [ ] Hourly 面板：显示今日每小时使用情况（24h 折线图）
   - [ ] Stats 面板：显示月度统计
   - [ ] Agents 面板：显示客户端信息

4. **tokscale 命令行测试**
   ```cmd
   # 新开命令提示符
   tokscale --json --today --no-spinner
   ```
   - [ ] 返回 JSON 格式的今日使用数据
   - [ ] 无 "command not found" 错误

### 4. 卸载测试

1. **通过控制面板卸载**
   - [ ] 打开 "设置 > 应用 > 应用和功能"
   - [ ] 找到 "Tokscale Floating Monitor 0.1.0"
   - [ ] 点击卸载并完成卸载向导

2. **通过卸载程序卸载**
   - [ ] 运行安装目录下的 `Uninstall.exe`
   - [ ] 完成卸载向导

3. **卸载后验证**
   - [ ] 安装目录被完全删除
   - [ ] 开始菜单快捷方式被删除
   - [ ] 桌面快捷方式被删除
   - [ ] PATH 环境变量中的安装目录被移除
   - [ ] 开机启动项被删除
   - [ ] `tokscale` 命令不再可用

### 5. 静默安装测试（自动化部署）

```cmd
# 静默安装到默认位置
Tokscale Floating Monitor-0.1.0-setup.exe /S

# 静默安装到指定目录
Tokscale Floating Monitor-0.1.0-setup.exe /S /D=C:\Custom\Path
```

验证项：
- [ ] 无用户交互完成安装
- [ ] 所有文件正确部署
- [ ] 环境变量正确设置

## 已知问题与解决方案

### 1. PATH 更新延迟
- **现象**: 安装后立即打开的命令行可能无法识别 `tokscale` 命令
- **解决方案**: 重启命令行或注销/登录 Windows 会话

### 2. 中文路径问题
- **现象**: 安装到含中文路径时可能遇到权限或路径解析问题
- **解决方案**: 使用简单英文路径或确保用户有完全控制权限

### 3. 防病毒软件误报
- **现象**: Windows Defender 或其他防病毒软件可能将 tokscale.exe 标记为可疑
- **解决方案**: 将安装目录添加到防病毒软件白名单

### 4. 代理网络环境
- **现象**: tokscale 命令因网络连接失败
- **解决方案**: 应用自动检测端口 7890 代理，如需其他代理可手动设置环境变量

## 测试环境要求

- **操作系统**: Windows 10/11 (64位)
- **权限**: 管理员权限（安装时需要）
- **网络**: 可访问互联网（tokscale 需要获取价格表）
- **磁盘空间**: 至少 200 MB 可用空间

## 自动化测试脚本

```powershell
# install-test.ps1 - 自动化安装测试脚本
param(
    [string]$InstallerPath = "release\Tokscale Floating Monitor-0.1.0-setup.exe",
    [string]$InstallDir = "C:\Test\TokscaleMonitor"
)

# 1. 静默安装
Write-Host "正在安装到 $InstallDir..." -ForegroundColor Yellow
Start-Process -Wait -FilePath $InstallerPath -ArgumentList "/S", "/D=$InstallDir"

# 2. 验证安装
if (Test-Path "$InstallDir\Tokscale Floating Monitor.exe") {
    Write-Host "✓ 安装成功" -ForegroundColor Green
} else {
    Write-Host "✗ 安装失败" -ForegroundColor Red
    exit 1
}

# 3. 验证 PATH
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if ($path -match [regex]::Escape($InstallDir)) {
    Write-Host "✓ PATH 已添加" -ForegroundColor Green
} else {
    Write-Host "✗ PATH 未添加" -ForegroundColor Red
}

# 4. 验证 tokscale 命令
try {
    $output = & "tokscale" "--json" "--today" "--no-spinner" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ tokscale 命令可用" -ForegroundColor Green
    } else {
        Write-Host "✗ tokscale 命令失败" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ tokscale 命令未找到" -ForegroundColor Red
}

# 5. 静默卸载
Write-Host "正在卸载..." -ForegroundColor Yellow
Start-Process -Wait -FilePath "$InstallDir\Uninstall.exe" -ArgumentList "/S"

# 6. 验证卸载
if (-not (Test-Path $InstallDir)) {
    Write-Host "✓ 卸载成功" -ForegroundColor Green
} else {
    Write-Host "✗ 卸载失败" -ForegroundColor Red
}
```

## 发布检查清单

- [ ] 安装包文件名正确包含版本号
- [ ] 安装包大小合理（~109 MB）
- [ ] 安装向导显示正确的中文信息
- [ ] 允许自定义安装路径
- [ ] 创建桌面和开始菜单快捷方式
- [ ] 正确添加 PATH 环境变量
- [ ] 设置开机自动启动
- [ ] 卸载程序正常工作
- [ ] 所有 6 个数据面板能正常加载
- [ ] tokscale 命令行工具可用
- [ ] 支持静默安装参数 (`/S`, `/D=`)
- [ ] 文档完整（README.md, CHANGELOG.md, INSTALL_TEST.md）

## 紧急修复流程

如果测试发现问题：

1. **修改代码**：修复问题
2. **更新版本**：`npm run version:patch`
3. **更新日志**：更新 CHANGELOG.md
4. **重新构建**：`npm run build`
5. **重新测试**：使用本指南测试新版本