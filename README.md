# AI Web Page Generator

A Next.js application that generates web pages from natural language prompts using an AI agent architecture. Features a **Figma-like canvas** with multiple design frames, component-based generation, and intelligent update vs. regeneration decisions.

📹 **[Watch the Demo Video](https://loom.com/share/da9cee3c243f4956bed9dd5d9f7aef6c?from_recorder=1&focus_title=1)**


## ✨ Key Features

- **🎨 Figma-like Canvas**: Infinite canvas with zoom/pan, multiple design frames side-by-side
- **🌿 Design Branching**: Duplicate designs to create variants, like Git branches for UI
- **🧩 Component-based Generation**: Screens decomposed into reusable components (Header, Hero, Footer, etc.)
- **🧠 Smart Updates**: Agent decides whether to regenerate the whole screen or update specific components
- **📐 Spatial Layouts**: Supports stack, sidebar-left/right, holy-grail, and grid layouts
- **🖼️ AI-Generated Images**: DALL-E 3 integration with progressive loading
- **💬 Conversation Context**: References like "the header" understood from context
- **⚡ Parallel Generation**: Components generated simultaneously for faster results

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- OpenAI API key (GPT-4 + DALL-E access)

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Add your OpenAI API key to .env
# OPENAI_API_KEY=sk-your-key-here

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

| Variable           | Required | Description                            |
| ------------------ | -------- | -------------------------------------- |
| `OPENAI_API_KEY` | Yes      | Your OpenAI API key                    |
| `OPENAI_MODEL`   | No       | Model to use (default:`gpt-4o-mini`) |

## 📖 Usage

### Creating Designs

1. **Enter a prompt** describing the page you want:

   - "SaaS landing page with hero, features, and pricing"
   - "Dashboard with sidebar navigation and analytics cards"
   - "E-commerce product page for sneakers"
2. **Iterate with follow-ups**:

   - "Make the header darker"
   - "Add a testimonials section"
   - "Move pricing above the FAQ"

### Working with the Canvas

- **Zoom**: Ctrl/Cmd + scroll (zooms toward cursor)
- **Pan**: Scroll or Alt + drag
- **Fit to screen**: Button in bottom-left corner

### Branching Designs

- Click **"Branch"** on any design to create a copy
- Ask for changes: "Create a version with a dark theme"
- Original stays intact, variant shows changes

### Complete Redesign

Say explicitly:

- "Delete everything and create a portfolio page"
- "Start over with a blog layout"
- "Replace with a completely different design"

## 🏗️ Architecture

See [explanation.md](./explanation.md) for comprehensive architecture documentation.

### Project Structure

```
├── app/
│   ├── api/
│   │   ├── generate/route.ts      # Main agent endpoint
│   │   ├── generate-image/route.ts # DALL-E image generation
│   │   └── reset/route.ts         # Reset session
│   ├── layout.tsx
│   ├── page.tsx                   # Main UI with canvas
│   └── globals.css
├── components/
│   ├── Canvas.tsx                 # Figma-like infinite canvas
│   ├── DesignFrame.tsx            # Individual design artboard
│   ├── PromptBox.tsx              # Input area
│   └── Sidebar.tsx                # Components/History/Designs tabs
├── lib/
│   ├── agent/
│   │   ├── index.ts               # Agent orchestration
│   │   ├── schemas.ts             # Zod schemas for LLM output
│   │   ├── tools.ts               # Agent tools (create, update, compose)
│   │   └── prompts.ts             # System prompts
│   ├── state/
│   │   └── index.ts               # In-memory session store
│   └── types/
│       └── index.ts               # TypeScript types
```

## 🎯 Key Implementation Details

### Agent Decision Flow

```
User Prompt → Agent Analysis → Decision → Execution → UI Update
                   ↓
         [REGENERATE_SCREEN]  or  [UPDATE_COMPONENTS]
                   ↓                      ↓
         Create all new           Update specific components
         Clear existing           Add new components
                                  Reorder screen
```

### Component Independence

Each design frame stores its own **snapshot** of components:

- Frames are completely independent
- Updating one doesn't affect others
- Branching creates deep copies

### Layout System

The agent specifies spatial layouts:

- `stack` - Vertical stacking (landing pages)
- `sidebar-left/right` - Dashboard layouts
- `holy-grail` - Header + sidebar + footer
- `grid-2/3` - Multi-column layouts

### Image Generation

- DALL-E 3 generates real images from descriptions
- Progressive loading with shimmer placeholders
- Caching to avoid regenerating identical images

## ⚡ Performance

- **Parallel component generation**: 5 components in ~15s vs ~75s sequential
- **Fast model**: gpt-4o-mini by default (3-5x faster than gpt-4-turbo)
- **Image caching**: Repeated prompts served from cache instantly
- **Global session store**: Survives Next.js hot reloads in dev mode

## ⚠️ Limitations

- **In-memory state**: Sessions lost on server restart
- **Single user**: No authentication or multi-tenancy
- **Generation time**: 15-60 seconds depending on complexity

### Hardcoded Elements

Some aspects are currently hardcoded and would need refactoring for full flexibility:

| Priority | Item               | Location               | Issue                  |
| -------- | ------------------ | ---------------------- | ---------------------- |
| 🔴 High  | Regen keywords     | `index.ts:76-80`     | Fixed English keywords |
| 🔴 High  | Layout types       | `schemas.ts:30`      | Only 6 options         |
| 🔴 High  | Branch keywords    | `prompts.ts:31-36`   | Fixed English keywords |
| 🟡 Med   | Color suggestions  | `tools.ts:132-137`   | Biases outputs         |
| 🟡 Med   | Spacing hints      | `tools.ts:145-148`   | May cause uniformity   |
| 🟡 Med   | Image examples     | `tools.ts:163-187`   | May be copied          |
| 🟡 Med   | Example prompts    | `page.tsx:22-39`     | Limited variety        |
| 🟡 Med   | Frame name mapping | `page.tsx:359-369`   | Fixed patterns         |
| 🟡 Med   | Loading steps      | `Canvas.tsx:283-289` | Fake progress          |
| 🟢 Low   | Canvas defaults    | `Canvas.tsx:36-40`   | Starting view          |
| 🟢 Low   | Frame size         | `page.tsx:67`        | Initial dimensions     |
| 🟢 Low   | Zoom limits        | `Canvas.tsx:23-25`   | Min/max bounds         |
