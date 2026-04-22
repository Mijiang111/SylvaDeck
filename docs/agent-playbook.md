# Studio Agent Playbook
# Studio Agent 使用手册

**Status:** Draft v1  
**状态：** 草案 v1

This document is a bilingual, agent-friendly playbook for working with `ppt-workbench-studio`.
It is not only an engineering reference. It is a practical guide for humans and coding agents to generate, edit, review, repair, and export decks with a high success rate.

这是一份面向 `ppt-workbench-studio` 的中英对照、agent-friendly 使用手册。
它不是纯工程文档，而是一份帮助人类和编码 agent 以更高成功率完成生成、编辑、review、repair 和导出的实战指南。

---

## 1. Product Model
## 1. 产品模型

Studio is a local-first AI presentation workbench for generating, refining, and authoring fixed-size `16:9` HTML slide decks.

Studio 是一个本地优先的 AI 演示文稿工作台，用来生成、精修和编辑固定尺寸的 `16:9` HTML 幻灯片。

The mental model is:

它的核心心智模型是：

1. Generate a slide deck from a brief.
2. Review the deck for fit, title quality, density, and export readiness.
3. Repair only real hard failures.
4. Edit content and visuals directly in the iframe canvas.
5. Export pure `16:9` slides as HTML or PPTX.

1. 先根据 brief 生成 deck。
2. 再对 deck 做 fit、标题质量、信息密度和导出就绪度 review。
3. 只对真正的 hard failure 做 repair。
4. 在 iframe 画布里直接编辑内容和视觉元素。
5. 最后导出为纯 `16:9` 页面形式的 HTML 或 PPTX。

---

## 2. Core Rules
## 2. 核心规则

### 2.1 Page, Block, Visual
### 2.1 Page、Block、Visual 三层模型

- `Page` is the slide-level unit.
- `Block` is editable text content such as headline, paragraph, list, and eyebrow.
- `Visual` is a visual node such as chart frame, annotation, badge, divider, rail, or surface.

- `Page` 是页面级单位。
- `Block` 是可编辑文本内容，比如 headline、paragraph、list、eyebrow。
- `Visual` 是视觉节点，比如 chart frame、annotation、badge、divider、rail、surface。

Do not treat all DOM elements equally.
Agents should reason in page/block/visual layers, not raw HTML nodes first.

不要把所有 DOM 元素等同看待。
Agent 应优先用 page/block/visual 三层模型思考，而不是直接把原始 HTML 节点当成主要操作对象。

### 2.2 Selection Modes
### 2.2 选择模式

- `Page` mode is content-first.
- `Text` mode is block-first.
- `Visual` mode is visual-first.

- `Page` 模式是内容优先。
- `Text` 模式是 block 优先。
- `Visual` 模式是 visual 优先。

Decorative surfaces should not dominate clicks in `Page` or `Text` mode.
They are intentionally more selectable in `Visual` mode.

decorative surface 不应在 `Page` 或 `Text` 模式里主导点击命中。
它们只应在 `Visual` 模式里更容易被直接选中。

### 2.3 Repair Severity
### 2.3 Repair 严重度

- `pass`: no repair needed
- `soft-warning`: quality concern, but do not auto-repair
- `hard-fail`: true failure that may require deterministic or AI repair

- `pass`：无需修复
- `soft-warning`：有质量提醒，但不应自动修复
- `hard-fail`：真实失败，可能需要 deterministic 或 AI repair

For short decks, pure semantic density should remain a `soft-warning` unless it also causes real overflow or title failure.

对于短 deck，纯语义密度问题应保持为 `soft-warning`，除非它同时引发了真实 overflow 或标题失败。

---

## 3. Prompt Shape
## 3. Prompt 形状

The best prompts are specific about:

最有效的 prompt 通常会明确这些维度：

- page count
- audience
- deck style
- page role
- level of density
- what must stay fixed
- what may change

- 页数
- 受众
- deck 风格
- 每页角色
- 信息密度
- 哪些必须保持不变
- 哪些允许变化

### Good cold-start prompt
### 好的冷启动 prompt

`Create a 3-page 16:9 board-style deck for healthcare operations leaders. Page 1 gives one clear claim, page 2 shows evidence, page 3 gives execution priorities. Keep the deck low-density and export-ready.`

`做一个 3 页、16:9、面向医疗运营管理层的 board-style deck。第 1 页只讲一个核心判断，第 2 页给证据，第 3 页给执行优先级。保持低密度，并保证导出就绪。`

### Good warm-start prompt
### 好的热启动 prompt

`Keep the page structure and chart. Rewrite page 2 headline and shorten the supporting bullets so the page reads more clearly.`

`保持页面结构和图表不变。重写第 2 页标题，并缩短辅助 bullets，让页面更清晰。`

### Bad prompt
### 不好的 prompt

`Make it better.`

`改好一点。`

This is too vague for stable generation or reliable editing.

这个说法太模糊，不利于稳定生成，也不利于可靠编辑。

---

## 4. Vocabulary Mapping
## 4. 词汇映射

Agents should use a stable shared vocabulary.

Agent 应使用稳定的共享词汇。

### Style words
### 风格词

- `board-style`: low-density, clear headline, restrained decoration
- `McKinsey-style`: assertion-led, structured evidence, clean zones
- `editorial`: stronger typography, lighter chrome, more visual hierarchy
- `evidence page`: chart + proof blocks, but headline still leads

- `board-style`：低密度、标题清晰、装饰克制
- `McKinsey-style`：结论先行、证据结构化、页面分区清晰
- `editorial`：更强 typography、更轻 chrome、更强调视觉层级
- `evidence page`：图表加证明模块并存，但 headline 仍然主导

### Editing words
### 编辑词

- `make it easier to edit`: reduce decorative hit area, keep text selectable, delay noisy chrome
- `keep layout`: prefer text rewrite over structure rewrite
- `tighten density`: shorten copy first, do not redesign unless necessary
- `preserve export`: avoid changes that break pure `16:9` page output

- `make it easier to edit`：减少 decorative 命中范围，保证文字可选，避免过早出现吵闹的 chrome
- `keep layout`：优先改文案，不优先改结构
- `tighten density`：先缩文案，不要一上来重做版式
- `preserve export`：避免引入会破坏纯 `16:9` 页面导出的改动

---

## 5. Generation Playbook
## 5. 生成 Playbook

### Recommended generation order
### 推荐生成顺序

1. Define page roles.
2. Generate page-level HTML.
3. Extract block structure.
4. Extract visual structure.
5. Review for fit and title quality.
6. Repair only if needed.

1. 先定义每页角色。
2. 再生成页面级 HTML。
3. 提取 block structure。
4. 提取 visual structure。
5. 做 fit 和标题质量 review。
6. 只在必要时 repair。

### Generation guidance
### 生成指导原则

- Prefer one main claim per page.
- Prefer explicit zones over blended layouts.
- Prefer stable text blocks over decorative wrapper tricks.
- Prefer exportable structure over fragile novelty.

- 每页优先只承载一个主结论。
- 优先清晰分区，不优先混合式复杂布局。
- 优先稳定文本块，不优先依赖装饰性 wrapper 小技巧。
- 优先可导出的稳定结构，而不是脆弱的新奇效果。

---

## 6. Editing Playbook
## 6. 编辑 Playbook

### 6.1 Text editing
### 6.1 文本编辑

When the goal is copy change:

当目标是改文案时：

- select the `block`
- keep the `visual` untouched when possible
- use quick edit for small rewrites
- use block transform only when layout really needs it

- 优先选中 `block`
- 尽量不要动 `visual`
- 小改文案时优先用 quick edit
- 只有版式确实需要变动时才做 block transform

### 6.2 Visual editing
### 6.2 视觉编辑

When the goal is container or shape change:

当目标是改容器或形状时：

- switch to `Visual` mode
- select the surface, chart frame, annotation, or badge directly
- avoid editing decorative surfaces from `Page` mode

- 先切到 `Visual` 模式
- 直接选中 surface、chart frame、annotation 或 badge
- 不要在 `Page` 模式里硬改 decorative surface

### 6.3 Expected interaction rhythm
### 6.3 预期交互节奏

- first click selects
- second click or explicit edit action enters quick edit
- move should only start from the move grip
- resize should only start from resize handles

- 第一次点击负责选中
- 第二次点击或显式点击 edit 才进入 quick edit
- 只有点到 move grip 才开始移动
- 只有点到 resize handle 才开始缩放

### 6.4 Structural separation
### 6.4 结构分层

For title wrappers, closing strips, hero bands, and similar structures:

对于 title wrapper、closing strip、hero band 这类结构：

- text should remain a text block
- the wrapper should remain a visual surface
- do not collapse both into one editing target

- 文本应保持为 text block
- 容器应保持为 visual surface
- 不要把两者塌缩成一个统一编辑目标

---

## 7. Review and Repair Playbook
## 7. Review 与 Repair Playbook

### 7.1 What counts as hard-fail
### 7.1 哪些属于 hard-fail

Typical hard-fail reasons include:

典型 hard-fail 原因包括：

- `overflowX`
- `overflowY`
- title `promptLeak`
- title `truncated`
- title `repeatedInstruction`

### 7.2 Deterministic first
### 7.2 先 deterministic

Always prefer deterministic cleanup before AI repair when possible.

在可能的情况下，总是优先 deterministic cleanup，再考虑 AI repair。

Examples:

例如：

- title sanitize before title rewrite by model
- deterministic shrink before escalation to AI overflow repair

- 标题清洗优先于模型重写标题
- deterministic shrink 优先于 AI overflow repair

### 7.3 Do not over-repair
### 7.3 不要过度修复

- Do not send pure `soft-warning` pages into AI repair.
- Do not run a second AI repair pass if the first pass did not materially improve the page.

- 不要把纯 `soft-warning` 页面送进 AI repair。
- 如果第一轮 AI repair 没有带来实质改善，就不要再自动发第二轮。

---

## 8. Export Playbook
## 8. 导出 Playbook

### Export rule
### 导出规则

Export should always come from real `16:9` slide pages, not from editor chrome or workspace shells.

导出必须始终来自真实的 `16:9` 页面，而不是编辑器 chrome 或工作区壳子。

### HTML export
### HTML 导出

- export page-level markup
- do not serialize the immersive workspace root
- preserve page background, remove editor shell background

- 导出页面级 markup
- 不要序列化 immersive workspace root
- 保留页面自身背景，去掉编辑器壳子背景

### PPTX export
### PPTX 导出

- collect only real export page frames
- preserve wide layout
- do not capture the black workspace background

- 只采集真实导出页 frame
- 保持 widescreen layout
- 不要把黑色工作区背景带进导出

---

## 9. Failure Playbook
## 9. 故障 Playbook

### If title is hard to select
### 如果标题很难选中

Check:

检查：

- whether a decorative surface is winning the hit test
- whether the page is in `Visual` mode when it should be in `Page` or `Text`
- whether the selected block frame is too aggressive

- decorative surface 是否抢到了 hit test
- 当前是否误处于 `Visual` 模式，而本该在 `Page` 或 `Text`
- selected block frame 的命中范围是否过于激进

### If export includes black background
### 如果导出带了黑底

Check:

检查：

- whether export serialized the editor root instead of slide pages
- whether the exporter collected generic iframes instead of true export frames

- 导出是否序列化了 editor root，而不是 slide page
- exporter 是否抓了泛化 iframe，而不是真正的 export frame

### If every generation escalates into repair
### 如果每次生成都进入 repair

Check:

检查：

- whether review classification is still too coarse
- whether `soft-warning` pages are incorrectly treated as `hard-fail`
- whether title sanitize could resolve the issue locally

- review 分类是否仍然过粗
- `soft-warning` 页面是否被误当成了 `hard-fail`
- 标题问题是否本地 sanitize 就能解决

### If visual surfaces cannot be selected
### 如果 visual surface 选不中

Check:

检查：

- whether the inspector is really in `Visual` mode
- whether the element still has a visual id and visual kind
- whether click handling is being intercepted by a block layer

- inspector 是否真的处于 `Visual` 模式
- 元素是否仍保留 visual id 和 visual kind
- 点击是否被 block layer 提前拦截

---

## 10. Good Agent Behaviors
## 10. 好的 Agent 行为

Agents working in Studio should:

在 Studio 里工作的 agent 应该：

- preserve stable page structure when possible
- prefer local deterministic fixes over broad rewrites
- make the smallest change that solves the real problem
- keep exportability in mind during editing
- explain whether a change is about content, interaction, repair, or export

- 尽量保留稳定页面结构
- 优先本地 deterministic 修复，而不是大面积重写
- 用最小改动解决真实问题
- 编辑时始终考虑导出稳定性
- 明确说明当前改动属于内容、交互、repair 还是导出层

Agents should avoid:

Agent 应避免：

- rewriting the whole page for a small copy issue
- turning decorative wrappers into dominant content objects
- fixing export bugs by changing the visible design
- escalating soft concerns into expensive repair loops

- 为了小文案问题就重写整页
- 把 decorative wrapper 变成主导内容对象
- 通过改可见设计来规避导出 bug
- 把 soft concern 升级成昂贵的 repair 循环

---

## 11. Suggested Prompt Templates
## 11. 推荐 Prompt 模板

### Generate a new deck
### 新建 deck

`Create a 3-page 16:9 executive deck. Page 1 is the claim, page 2 is the evidence page, page 3 is the action page. Keep the layout clean, editable, and export-ready.`

`创建一个 3 页的 16:9 executive deck。第 1 页讲核心判断，第 2 页做证据页，第 3 页做行动页。保持布局干净、易编辑、可导出。`

### Rewrite one page only
### 只改一页

`Rewrite page 2 only. Keep the chart and page zones. Shorten the bullets and strengthen the headline.`

`只改第 2 页。保留图表和页面分区。缩短 bullets，并强化 headline。`

### Improve editing feel
### 改善编辑手感

`Keep the design, but make the title easier to select and edit. Decorative surfaces should not dominate hits in Page mode.`

`保持设计不变，但让标题更容易被选中和编辑。decorative surface 不应在 Page 模式里主导命中。`

### Export-safe refinement
### 导出安全精修

`Refine the page without changing its 16:9 export structure. Do not introduce editor-only wrappers or shell-dependent layout.`

`在不改变 16:9 导出结构的前提下精修页面。不要引入仅编辑器可用的 wrapper，也不要依赖 shell 布局。`

---

## 12. Maintenance Notes
## 12. 维护说明

This playbook should evolve with the product.
Whenever Studio changes its review model, editing semantics, or export pipeline, update this document together with the code.

这份 playbook 应随着产品一起演化。
每当 Studio 的 review 模型、编辑语义或导出链路发生变化时，都应和代码一起更新这份文档。

Recommended future additions:

建议后续补充：

- a starter-pack vocabulary appendix
- a repair decision tree
- an interaction glossary for iframe editing
- examples for long-form decks

- starter-pack 词汇附录
- repair 决策树
- iframe 编辑交互术语表
- long-form deck 示例
