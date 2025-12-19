# @stockfish/node

> UCI interface for native Stockfish

## Installation

```bash
bun add @stockfish/node
```

Download or build the [Stockfish](https://stockfishchess.org/download/) engine from source.
If necessary, mark the binary as executable.

## Usage

`@stockfish/node` provides methods thinly wrapping the UCI commands supported by the stockfish engine.
For better type checking, the results and options are explicitly typed and parsed instead unlike the strings UCI operates on.

Most operations are asynchronous and return a promise. If a command is sent before the previous command has been returned, it will be queued and run after the previous commands complete.

### Create an engine instance

```ts
import Stockfish from "@stockfish/node";

const engine = new Stockfish("/path/to/engine", options);
```

Spawns the engine, and any sets the provided UCI options.

#### Options

```ts
type StockfishOptions = Partial<{
  "Debug Log File": string;
  Contempt: number;
  "Analysis Contempt": "Both" | "Off" | "White" | "Black" | "Both";
  Threads: number;
  Hash: number;
  Ponder: boolean;
  MultiPV: number;
  "Skill Level": number;
  "Move Overhead": number;
  "Minimum Thinking Time": number;
  "Slow Mover": number;
  nodestime: number;
  UCI_Chess960: boolean;
  UCI_AnalyseMode: boolean;
  UCI_LimitStrength: boolean;
  UCI_Elo: number;
  SyzygyPath: string;
  SyzygyProbeDepth: number;
  Syzygy50MoveRule: boolean;
  SyzygyProbeLimit: number;
}>;
```

### Search the position

```ts
const bestMove = await engine.search(options);
```

Search for the best move from the current position.

> Note: If the infinite option is passed, searching will continue until engine.stop() is called.

#### Search Options

```ts
type SearchOptions = Partial<{
  depth: number;
  wtime: number;
  btime: number;
  winc: number;
  binc: number;
  movestogo: number;
  nodes: number;
  mate: number;
  movetime: number;
  infinite: boolean;
  ponder: boolean;
  searchmoves: string[];
}>;
```

### Evaluate the position

```ts
const { score, detailed } = await engine.eval();
```

Get the score and detailed evaluation for the current position.

#### Set the position

```ts
engine.position(position);
```

Set the position used by `eval` and `search`.

```ts
interface Position {
  start: string; // "startpos" for the starting board or a FEN string. default: "startpos"
  moves: string[]; // moves in long algebraic notation. omit to just use the start position
}
```

### Start a new game

```ts
await engine.newgame();
await engine.position(); // reset to start position
```

### Quit

```ts
await engine.quit();
```

Quits the engine after all previous commands have finished.

### Kill

```ts
engine.kill();
```

Immediately kill the engine.

> Note: If there are active commands they **will not** resolve.

## TypeScript

`@stockfish/node` is written in TypeScript - no types install!
