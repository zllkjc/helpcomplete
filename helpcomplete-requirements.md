# 通用 Bash CLI 自动补全代理 — 需求文档

## 1. 背景

当前终端环境使用 Bash。日常会使用大量 CLI 工具，其中很多工具来自 npm 全局安装、`npx`、项目本地 `node_modules/.bin`，也可能包含其他来源的可执行命令。

现有问题：

- 很多 CLI 没有配置 Bash completion。
- 不希望为每个命令单独维护 completion 脚本。
- 经常能记住命令的大致前缀，但记不住完整子命令、参数名或参数层级。
- 希望输入类似：

```bash
codex r<Tab>
```

时能够自动提示：

```text
resume
```

以及：

```bash
some-cli deploy --<Tab>
```

时能够展示该子命令下可用的 flags。

目标是实现一个“通用 completion fallback 层”：

> 对没有原生 Bash completion 的命令，自动读取其 `--help` / `help` 输出，解析子命令和参数，并动态提供 Tab 补全。

该工具应尽量做到一次安装、全局生效，而不是逐命令配置。


## 2. 产品目标

实现一个 Bash 通用补全工具，暂定名称：

```text
helpcomplete
```

用户只需要在 `~/.bashrc` 中加入：

```bash
eval "$(helpcomplete init bash)"
```

即可启用。

之后，对于没有专用 Bash completion 的命令：

```bash
foo <Tab>
foo de<Tab>
foo deploy --<Tab>
```

工具应自动：

1. 识别当前命令和命令上下文。
2. 尝试读取对应层级的帮助信息。
3. 从帮助文本中解析：
   - 子命令
   - 长参数
   - 短参数
   - 参数值类型
4. 返回 Bash completion 候选。
5. 缓存解析结果，避免每次 Tab 都启动 CLI。


## 3. 非目标

第一版不要求：

- 100% 支持所有 CLI 的任意帮助格式。
- 理解 CLI 的业务语义。
- 修改或代理用户真实执行的命令。
- 替代已有的原生 completion。
- 对所有参数值进行智能补全。
- 使用 AI 在线推理完成补全。
- 解析完整 CLI 源码 AST。
- 支持 zsh / fish / PowerShell。

第一版只针对 Bash。


## 4. 核心设计原则

### 4.1 只代理 completion，不代理命令执行

不要做这种设计：

```text
foo -> helpcomplete wrapper -> real foo
```

正常执行：

```bash
foo deploy
```

必须完全绕过 helpcomplete。

只有按 Tab 触发 Bash completion 时，helpcomplete 才参与。

推荐通过 Bash programmable completion 实现。


### 4.2 原生 completion 优先

如果一个命令已经存在专用 Bash completion，则继续使用原生 completion。

helpcomplete 仅作为 fallback。

期望行为：

```text
git
  -> 使用 git 原生 completion

kubectl
  -> 使用 kubectl 原生 completion

未知 npm CLI
  -> helpcomplete fallback
```

可以考虑使用 Bash：

```bash
complete -D
```

注册默认 completion handler。


### 4.3 按上下文递归读取 help

对于：

```bash
foo <Tab>
```

读取：

```bash
foo --help
```

对于：

```bash
foo deploy <Tab>
```

优先读取：

```bash
foo deploy --help
```

对于：

```bash
foo deploy service <Tab>
```

优先读取：

```bash
foo deploy service --help
```

需要根据 `COMP_WORDS` / `COMP_CWORD` 推导当前命令路径。


## 5. Bash 集成要求

Completion handler 需要利用 Bash 提供的变量：

```bash
COMP_WORDS
COMP_CWORD
COMP_LINE
COMP_POINT
```

至少需要支持：

- 当前 executable
- 已输入的子命令链
- 当前正在补全的 token
- 当前 token 是否以 `-` 开头


### 5.1 初始化接口

CLI：

```bash
helpcomplete init bash
```

输出可被 `eval` 的 Bash 初始化脚本：

```bash
eval "$(helpcomplete init bash)"
```

初始化脚本应：

- 注册 default completion handler
- 不破坏已经注册的专用 completion
- 尽量避免修改其他 Bash 行为


## 6. Help 获取策略

对一个命令上下文，例如：

```text
foo deploy
```

按以下顺序尝试：

```bash
foo deploy --help
foo deploy -h
foo help deploy
foo help
```

第一版建议至少实现：

```bash
<command path> --help
<command path> -h
```

超时时间必须有限制。

建议：

```text
500ms ~ 1500ms
```

可配置。

如果命令 help 执行超时：

- 立即放弃。
- 不阻塞 shell 太久。
- 本次返回空补全或 Bash 默认补全。


## 7. 安全要求

Help 探测本质上会执行 CLI，因此必须谨慎。


### 7.1 只允许安全帮助参数

只能主动执行：

```text
--help
-h
help
```

不得猜测或执行其他业务参数。


### 7.2 禁止危险命令探测

第一版建议提供 denylist，例如：

```text
rm
shutdown
reboot
sudo
su
ssh
scp
```

实际是否需要可由实现者评估。


### 7.3 超时

任何自动执行的命令都必须设置超时。


### 7.4 禁止 stdin 交互

执行 help 时：

```text
stdin = /dev/null
```

避免 CLI 进入交互模式。


### 7.5 环境变量

可以设置：

```text
CI=1
NO_COLOR=1
TERM=dumb
```

尽量获得纯文本 help。


## 8. Help Parser

这是整个项目的核心。


### 8.1 第一版需要识别的 section

常见标题：

```text
Commands:
Command:
Available Commands:
Subcommands:
SUBCOMMANDS
COMMANDS
```

参数标题：

```text
Options:
Flags:
Global Options:
OPTIONS
FLAGS
```

解析器应大小写不敏感。


### 8.2 子命令格式

至少支持：

```text
Commands:
  init
  build
  deploy
```

以及：

```text
Commands:
  init        Initialize project
  build       Build project
  deploy      Deploy project
```

以及：

```text
Available Commands:
  init        ...
```

输出结构建议：

```json
{
  "name": "deploy",
  "description": "Deploy project",
  "type": "command"
}
```


### 8.3 Flag 格式

至少识别：

```text
--verbose
-v
-v, --verbose
--config <path>
--config=<path>
-c, --config <file>
--mode [mode]
```

内部结构：

```json
{
  "short": "-c",
  "long": "--config",
  "value": {
    "required": true,
    "name": "file"
  },
  "description": "Config file"
}
```


## 9. 参数值类型推断

第一版只需要简单 heuristic。

例如：

```text
<file>
<path>
<filename>
```

推断为：

```text
file
```

对应 Bash：

```bash
compgen -f
```

以下：

```text
<dir>
<directory>
<folder>
```

推断为：

```text
directory
```

对应：

```bash
compgen -d
```

以下：

```text
<boolean>
<true|false>
```

可返回：

```text
true
false
```

以下：

```text
<mode>
```

若无法知道枚举值，则暂时不补全。


## 10. Completion 决策逻辑

输入：

```bash
foo dep<Tab>
```

当前 token：

```text
dep
```

如果不以 `-` 开头：

返回：

- 子命令
- 必要时文件路径


输入：

```bash
foo deploy --v<Tab>
```

当前 token：

```text
--v
```

返回匹配的 flag：

```text
--verbose
```


输入：

```bash
foo --config <Tab>
```

如果解析器知道：

```text
--config <file>
```

则返回文件列表。


## 11. 缓存

必须实现缓存。

原因：

Node/npm CLI 启动速度可能达到几十到几百毫秒。

不能每次按 Tab 都执行：

```bash
foo --help
```


### 11.1 建议缓存路径

```text
~/.cache/helpcomplete/
```

例如：

```text
~/.cache/helpcomplete/
  codex/
    root.json
    resume.json

  my-cli/
    root.json
    deploy.json
```


### 11.2 Cache key

至少包含：

```text
executable absolute path
subcommand path
```

建议额外包含：

```text
executable mtime
CLI version
```

如果 executable 发生变化，则失效。


### 11.3 TTL

默认：

```text
24h
```

允许配置：

```bash
HELPCOMPLETE_CACHE_TTL=86400
```


### 11.4 手动清缓存

提供：

```bash
helpcomplete cache clear
```

以及：

```bash
helpcomplete cache clear codex
```


## 12. npm 生态增强

这是高优先级增强项，但可以放在 MVP 后。


### 12.1 检测 npm binary

如果 executable 位于：

```text
node_modules/.bin/
```

或全局 npm bin 目录，则尝试找到 package.json。


### 12.2 Package metadata

可读取：

```json
{
  "name": "...",
  "version": "...",
  "bin": {}
}
```

用于：

- 缓存失效
- 调试
- 识别 CLI 来源


### 12.3 原生 completion 检测

未来可以尝试检测 package 是否暴露：

```text
completion
completions
shell-completion
```


## 13. 命令行接口

最低要求：

```bash
helpcomplete init bash
```

可选：

```bash
helpcomplete inspect foo
```

输出：

```text
Executable: /usr/local/bin/foo
Cache: hit
Detected commands:
  init
  build
  deploy

Detected flags:
  -h, --help
  -v, --verbose
```


建议：

```bash
helpcomplete debug foo deploy
```

显示：

```text
Help command:
  foo deploy --help

Parser:
  generic

Parsed:
  commands: 4
  flags: 8
```


缓存：

```bash
helpcomplete cache clear
helpcomplete cache clear foo
```


## 14. 配置

可以通过环境变量：

```bash
HELPCOMPLETE_ENABLED=1

HELPCOMPLETE_CACHE_TTL=86400

HELPCOMPLETE_TIMEOUT_MS=1000

HELPCOMPLETE_CACHE_DIR="$HOME/.cache/helpcomplete"
```

可选：

```bash
HELPCOMPLETE_DEBUG=1
```


## 15. Parser 架构

不要把所有格式写进一个巨大 regex。

建议：

```text
Parser interface

  canParse(text)
  parse(text)
```

例如：

```text
parsers/
  generic.ts
  commander.ts
  yargs.ts
  oclif.ts
```

MVP 可以只有：

```text
generic.ts
```

未来逐步加框架专用 parser。


## 16. Commander / Yargs 等框架识别

未来增强。

npm CLI 常用：

```text
commander
yargs
oclif
cac
clipanion
meow
```

这些框架的 help 输出相对稳定。

如果能识别 help 风格，可以使用专门 parser，提高准确率。

例如：

```text
Usage: foo [options] [command]

Options:
  -V, --version
  -h, --help

Commands:
  init
  dev
```

可以判断为 Commander 风格。


## 17. 输出格式

completion engine 内部建议统一为结构化 JSON：

```json
{
  "commands": [
    {
      "name": "deploy",
      "description": "Deploy application"
    }
  ],
  "options": [
    {
      "short": "-c",
      "long": "--config",
      "description": "Config file",
      "value": {
        "required": true,
        "type": "file"
      }
    }
  ]
}
```

Shell handler 只负责把结构转换成：

```bash
COMPREPLY
```


## 18. 推荐实现语言

由于目标用户大量使用 npm CLI，优先考虑：

```text
TypeScript / Node.js
```

优点：

- 方便 npm 全局安装。
- 文本 parsing 方便。
- JSON/cache 处理简单。
- 后续容易发布到 npm。

建议安装：

```bash
npm install -g helpcomplete
```

但要注意 Node CLI 启动开销。

因此建议：

- 尽可能让 Bash handler 做轻量判断。
- Node 程序负责 cache miss 和 help parsing。
- cache hit 时尽量快速返回。
- 如性能不足，可后续改成 Bun / Go / Rust。


## 19. 性能目标

Cache hit：

```text
< 30ms
```

理想：

```text
< 10ms
```

Cache miss：

取决于目标 CLI，但 helpcomplete 自身额外开销应尽量：

```text
< 50ms
```

Help command 必须受到 timeout 限制。


## 20. Fallback 行为

任何异常都不能破坏 Bash。

例如：

- executable 不存在
- help command 超时
- help 输出为空
- parser exception
- cache 损坏

都应该：

```text
silent fail
```

然后交给 Bash 默认 completion。

Debug mode 除外。


## 21. MVP 范围

第一版只实现：

1. `helpcomplete init bash`
2. Bash default completion
3. 获取 `cmd ... --help`
4. Generic parser
5. 识别子命令
6. 识别短/长 flags
7. file/directory 参数推断
8. 本地 cache
9. timeout
10. debug / inspect


暂不实现：

- AI parser
- CLI 源码 AST
- npm framework introspection
- shell history ranking
- zsh/fish
- 参数枚举深度推断


## 22. 示例场景

### Case 1

CLI：

```text
$ foo --help

Usage: foo [options] [command]

Commands:
  init
  build
  deploy

Options:
  -v, --verbose
  -h, --help
```

输入：

```bash
foo d<Tab>
```

期望：

```text
deploy
```


### Case 2

输入：

```bash
foo --v<Tab>
```

期望：

```text
--verbose
```


### Case 3

CLI：

```text
$ foo deploy --help

Options:
  -c, --config <file>
  --prod
```

输入：

```bash
foo deploy --<Tab>
```

期望：

```text
--config
--prod
```


### Case 4

输入：

```bash
foo deploy --config <Tab>
```

期望：

显示文件候选。


## 23. 验收标准

MVP 完成后应满足：

### 基础

```bash
eval "$(helpcomplete init bash)"
```

即可使用。


### 未知 CLI

对于一个不存在原生 completion、但 `--help` 包含 Commands / Options 的 CLI：

```bash
example-cli <Tab>
```

能展示子命令。


### 子命令递归

```bash
example-cli deploy <Tab>
```

能够读取：

```bash
example-cli deploy --help
```

并补全该层级参数。


### Flags

```bash
example-cli --<Tab>
```

显示 flags。


### Cache

第二次触发同一路径 completion 时：

不得再次执行 help command，除非缓存过期。


### Failure

当 help command 超时或失败：

shell 不报错、不挂起、不输出异常。


## 24. 后续增强方向

可以逐步增加：

### Completion ranking

结合：

```text
Bash history
```

将用户常用子命令排在前面。


### README fallback

npm package 中如果 `--help` 信息很弱：

```text
package.json
README.md
```

可作为额外信息来源。


### AI fallback

可选功能：

```text
无法被 parser 理解的 help text
        ↓
本地/在线 LLM
        ↓
结构化 completion spec
        ↓
cache
```

AI 不应该位于高频 Tab 路径。

只能在首次 cache miss 时运行。


### 自动贡献 parser

可以记录匿名/本地未知格式，方便持续扩展 parser。


## 25. 理想最终体验

用户安装：

```bash
npm install -g helpcomplete
```

加入：

```bash
eval "$(helpcomplete init bash)"
```

之后：

```bash
codex r<Tab>
```

```bash
wrangler pages <Tab>
```

```bash
some-random-npm-cli de<Tab>
```

```bash
internal-company-cli --<Tab>
```

在 CLI 没有原生 Bash completion 的情况下，仍然尽可能自动获得可用的命令补全。

核心理念：

> Native completion first, automatic `--help` introspection as universal fallback.
