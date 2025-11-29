// import copy
// import os
// from dataclasses import dataclass
// import re
// import datetime

import { console } from "node:inspector";

enum Piece {
  WHITE_PAWN = "P",
  BLACK_PAWN = "p",
  WHITE_KNIGHT = "N",
  BLACK_KNIGHT = "n",
  WHITE_BISHOP = "B",
  BLACK_BISHOP = "b",
  WHITE_ROOK = "R",
  BLACK_ROOK = "r",
  WHITE_QUEEN = "Q",
  BLACK_QUEEN = "q",
  WHITE_KING = "K",
  BLACK_KING = "k",
}

const ReversePieceMap = {
  P: Piece.WHITE_PAWN,
  p: Piece.BLACK_PAWN,
  N: Piece.WHITE_KNIGHT,
  n: Piece.BLACK_KNIGHT,
  B: Piece.WHITE_BISHOP,
  b: Piece.BLACK_BISHOP,
  R: Piece.WHITE_ROOK,
  r: Piece.BLACK_ROOK,
  Q: Piece.WHITE_QUEEN,
  q: Piece.BLACK_QUEEN,
  K: Piece.WHITE_KING,
  k: Piece.BLACK_KING,
} as const satisfies Record<string, Piece>;

enum Capture {
  DIRECT_CAPTURE = "direct capture",
  EN_PASSANT = "en passant",
  NO_CAPTURE = "no capture",
}

interface StockfishParameters {
  readonly "Debug Log File": string;
  readonly Contempt: number;
  readonly "Min Split Depth": number;
  readonly Threads: number;
  readonly Ponder: boolean;
  readonly Hash: number;
  readonly MultiPV: number;
  readonly "Skill Level": number;
  readonly "Move Overhead": number;
  readonly "Minimum Thinking Time": number;
  readonly "Slow Mover": number;
  readonly UCI_Chess960: boolean;
  readonly UCI_LimitStrength: boolean;
  readonly UCI_Elo: number;
}

type StockfishParametersKey = keyof StockfishParameters | "UCI_ShowWDL";

type UCICommand =
  | "d"
  | "eval"
  | "flip"
  | "isready"
  | "quit"
  | "uci"
  | "ucinewgame"
  | (string & {});

/**
 * Integrates the [Stockfish chess engine](https://stockfishchess.org) with Typescript.
 */
export class Stockfish {
  private readonly _RELEASES = {
    "17.1": "2025-03-30",
    "17.0": "2024-09-06",
    "16.1": "2024-02-24",
    "16.0": "2023-06-30",
    "15.1": "2022-12-04",
    "15.0": "2022-04-18",
    "14.1": "2021-10-28",
    "14.0": "2021-07-02",
    "13.0": "2021-02-19",
    "12.0": "2020-09-02",
    "11.0": "2020-01-18",
    "10.0": "2018-11-29",
  } as const;

  private readonly _PIECE_CHARS = [
    "P",
    "N",
    "B",
    "R",
    "Q",
    "K",
    "p",
    "n",
    "b",
    "r",
    "q",
    "k",
  ] as const;

  /**
   * `_PARAM_RESTRICTIONS` stores the types of each of the params, and any applicable min and max values, based off the Stockfish source code
   *
   * https://github.com/official-stockfish/Stockfish/blob/65ece7d985291cc787d6c804a33f1dd82b75736d/src/ucioption.cpp#L58-L82
   */
  private static readonly _PARAM_RESTRICTIONS = {
    "Debug Log File": ["string", null, null],
    Threads: ["number", 1, 1024],
    Hash: ["number", 1, 2048],
    Ponder: ["boolean", null, null],
    MultiPV: ["number", 1, 500],
    "Skill Level": ["number", 0, 20],
    "Move Overhead": ["number", 0, 5000],
    "Slow Mover": ["number", 10, 1000],
    UCI_Chess960: ["boolean", null, null],
    UCI_LimitStrength: ["boolean", null, null],
    UCI_Elo: ["number", 1320, 3190],
    Contempt: ["number", -100, 100],
    "Min Split Depth": ["number", 0, 12],
    "Minimum Thinking Time": ["number", 0, 5000],
    UCI_ShowWDL: ["boolean", null, null],
  } as const satisfies Record<
    StockfishParametersKey,
    ["number", number, number] | ["string" | "boolean", null, null]
  >;

  public static readonly DEFAULT_STOCKFISH_PARAMS = {
    "Debug Log File": "",
    Contempt: 0,
    "Min Split Depth": 0,
    Threads: 1,
    Ponder: false,
    Hash: 16,
    MultiPV: 1,
    "Skill Level": 20,
    "Move Overhead": 10,
    "Minimum Thinking Time": 20,
    "Slow Mover": 100,
    UCI_Chess960: false,
    UCI_LimitStrength: false,
    UCI_Elo: 1350,
  } as const satisfies StockfishParameters;

  private _path: string;
  private _has_quit_command_been_sent: boolean;
  private info: string;
  private _parameters: Partial<StockfishParameters>;
  private _stockfish: Bun.Subprocess<"pipe", "pipe", "pipe">;
  private _stdoutReader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  private _lineBuffer: string = "";

  private readonly _DEFAULT_NUM_NODES = 1000000 as const;
  private readonly _DEFAULT_DEPTH = 15 as const;
  private readonly _DEFAULT_TURN_PERSPECTIVE = true as const;

  public static readonly STARTING_POSITION_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" as const;

  private _num_nodes: number = this._DEFAULT_NUM_NODES;
  private _depth: number = this._DEFAULT_DEPTH;
  private _turn_perspective: boolean = this._DEFAULT_TURN_PERSPECTIVE;
  private _version: {
    full: number;
    major: number;
    minor: number;
    patch: string;
    sha: string;
    is_dev_build: boolean;
    text: string;
  };

  /**
   * @private Use `await Stockfish.create` instead
   */
  private constructor() {}

  /**
   * Initializes the Stockfish engine.
   *
   * @example ```ts
   * import { Stockfish } from "@stockfish/bun";
   * const stockfish = new Stockfish();
   * ```
   */
  static async create(options?: {
    path?: string;
    depth?: number;
    parameters?: Partial<StockfishParameters>;
    num_nodes?: number;
    turn_perspective?: boolean;
    debug_view?: boolean;
  }) {
    const stockfish = new Stockfish();
    const {
      path = "stockfish",
      depth = 15,
      parameters,
      num_nodes = 1000000,
      turn_perspective = true,
      debug_view = false,
    } = { ...options };

    stockfish._debug_view = debug_view;
    stockfish._path = path;
    stockfish._stockfish = Bun.spawn({
      cmd: [stockfish._path],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    stockfish._stdoutReader = stockfish._stockfish.stdout.getReader();

    stockfish._has_quit_command_been_sent = false;
    await stockfish._set_stockfish_version();
    stockfish._put("uci");
    stockfish.set_depth(depth);
    stockfish.set_num_nodes(num_nodes);
    stockfish.set_turn_perspective(turn_perspective);
    stockfish.info = "";
    stockfish._parameters = {};
    await stockfish.update_engine_parameters(
      Stockfish.DEFAULT_STOCKFISH_PARAMS
    );
    await stockfish.update_engine_parameters(parameters);
    if (await stockfish.does_current_engine_version_have_wdl_option()) {
      await stockfish._set_option("UCI_ShowWDL", true, false);
    }
    await stockfish._prepare_for_new_position(true);
    return stockfish;
  }

  set_debug_view(activate: boolean): void {
    this._debug_view = activate;
  }

  /**
   * Returns the current engine parameters being used.
   */
  get_engine_parameters() {
    return structuredClone(this._parameters);
  }

  /**
   * Updates the Stockfish engine parameters.
   */
  async update_engine_parameters(
    parameters?: Partial<StockfishParameters>
  ): Promise<void> {
    if (!parameters) return;

    const new_param_values = structuredClone(parameters);

    for (const key in new_param_values) {
      // if len(this._parameters) > 0 and key not in this._parameters:
      //     raise ValueError(f"'{key}' is not a key that exists.")

      // if key in ("Ponder", "UCI_Chess960", "UCI_LimitStrength") and not isinstance(
      //     new_param_values[key], bool
      // ):
      //     raise ValueError(
      //         f"The value for the '{key}' key has been updated from a string to a bool in a new release of the python stockfish package."
      //     )
      this._validate_param_val(key, new_param_values[key]);
    }

    if (
      "Skill Level" in new_param_values !== "UCI_Elo" in new_param_values &&
      !("UCI_LimitStrength" in new_param_values)
    ) {
      // # This means the user wants to update the Skill Level or UCI_Elo (only one,
      // # not both), and that they didn't specify a new value for UCI_LimitStrength.
      // # So, update UCI_LimitStrength, in case it's not the right value currently.
      // if "Skill Level" in new_param_values:
      //     new_param_values.update({"UCI_LimitStrength": false})
      // elif "UCI_Elo" in new_param_values:
      //     new_param_values.update({"UCI_LimitStrength": true})
    }

    if ("Threads" in new_param_values) {
      // # Recommended to set the hash param after threads.
      // threads_value = new_param_values["Threads"]
      // del new_param_values["Threads"]
      // hash_value = null
      // if "Hash" in new_param_values:
      //     hash_value = new_param_values["Hash"]
      //     del new_param_values["Hash"]
      // else:
      //     hash_value = this._parameters["Hash"]
      // new_param_values["Threads"] = threads_value
      // new_param_values["Hash"] = hash_value
    }

    for (const [name, value] of Object.entries(new_param_values)) {
      await this._set_option(name, value);
    }

    // Getting SF to set the position again, since UCI option(s) have been updated.
    await this.set_fen_position(await this.get_fen_position(), false);
  }

  /**
   * Resets the Stockfish engine parameters.
   */
  async reset_engine_parameters(): Promise<void> {
    await this.update_engine_parameters(Stockfish.DEFAULT_STOCKFISH_PARAMS);
  }

  private async _prepare_for_new_position(
    send_ucinewgame_token: boolean = true
  ): Promise<void> {
    if (send_ucinewgame_token) {
      this._put("ucinewgame");
    }
    await this._is_ready();
    this.info = "";
  }

  private _put(command: UCICommand): void {
    if (!this._stockfish.stdin) {
      throw new BrokenPipeError();
    }

    if (this._stockfish.exitCode !== null) {
      return;
    }

    if (!this._has_quit_command_been_sent) {
      // console.debug({ command });
      this._stockfish.stdin.write(`${command}\n`);
      this._stockfish.stdin.flush();
      if (command === "quit") {
        this._has_quit_command_been_sent = true;
      }
    }
  }

  private async _read_line(): Promise<string> {
    if (!this._stockfish.stdout) {
      throw new BrokenPipeError();
    }
    if (this._stockfish.exitCode !== null) {
      throw new StockfishError("The Stockfish process has crashed");
    }
    while (true) {
      const newlineIndex = this._lineBuffer.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = this._lineBuffer.slice(0, newlineIndex).trim();
        this._lineBuffer = this._lineBuffer.slice(newlineIndex + 1);
        // console.debug({ line });
        return line;
      }
      const { value, done } = await this._stdoutReader.read();
      if (done) {
        if (this._lineBuffer.length > 0) {
          const line = this._lineBuffer.trim();
          this._lineBuffer = "";
          // console.debug({ line });
          return line;
        }
        if (this._has_quit_command_been_sent) {
          return "";
        }
        throw new StockfishError("Stream ended unexpectedly");
      }
      this._lineBuffer += new TextDecoder().decode(value, { stream: true });
    }
  }

  /**
   * Calls `_read_line()` until encountering `substr_in_last_line` in the line.
   */
  private async _discard_remaining_stdout_lines(
    substr_in_last_line: string
  ): Promise<void> {
    while (!(await this._read_line()).includes(substr_in_last_line));
  }

  private async _set_option(
    name: StockfishParametersKey,
    value: unknown,
    update_parameters_attribute: boolean = true
  ): Promise<void> {
    this._validate_param_val(name, value);
    const str_rep_value = String(value);
    this._put(`setoption name ${name} value ${str_rep_value}`);
    if (update_parameters_attribute) {
      Object.assign(this._parameters, { [name]: value });
    }
    await this._is_ready();
  }

  private _validate_param_val(
    name: StockfishParametersKey,
    value: unknown
  ): void {
    if (!(name in Stockfish._PARAM_RESTRICTIONS)) {
      throw new Error("{name} is not a supported engine parameter");
    }

    const [required_type, minimum, maximum] =
      Stockfish._PARAM_RESTRICTIONS[name];

    //         if type(value) is not required_type:
    //             raise ValueError(f"{value} is not of type {required_type}")

    //         if minimum is not null and type(value) is int and value < minimum:
    //             raise ValueError(f"{value} is below {name}'s minimum value of {minimum}")

    //         if maximum is not null and type(value) is int and value > maximum:
    //             raise ValueError(f"{value} is over {name}'s maximum value of {maximum}")
  }

  private async _is_ready(): Promise<void> {
    this._put("isready");
    while (true) {
      const line = await this._read_line();
      if (line === "readyok") return;
    }
  }

  private _go(): void {
    this._put(`go depth ${this._depth}`);
  }

  private _go_nodes(): void {
    this._put(`go nodes ${this._num_nodes}`);
  }

  private _go_time(time: number): void {
    this._put(`go movetime ${time}`);
  }

  private _go_remaining_time(wtime?: number, btime?: number): void {
    let cmd = "go";
    if (wtime !== undefined) {
      cmd += ` wtime ${wtime}`;
    }
    if (btime !== undefined) {
      cmd += ` btime ${btime}`;
    }
    this._put(cmd);
  }

  private _go_perft(depth: number): void {
    this._put(`go perft ${depth}`);
  }

  private _on_weaker_setting(): boolean {
    return (
      this._parameters.UCI_LimitStrength || this._parameters["Skill Level"] < 20
    );
  }

  /**
   * Will issue a warning, referring to the function that calls this one.
   */
  private _weaker_setting_warning(message: string): void {
    console.warn(
      `Note that even though you've set Stockfish to play on a weaker elo or skill level, ${message}`
    );
  }

  /**
   * Sets current board position in Forsyth-Edwards notation (FEN).
   *
   * @param fen_position FEN string of board position.
   *
   * @param send_ucinewgame_token Whether to send the `ucinewgame` token to the Stockfish engine.\
   *                              The most prominent effect this will have is clearing Stockfish's transposition table,
   *                              which should be done if the new position is unrelated to the current position.
   */
  async set_fen_position(
    fen_position: string,
    send_ucinewgame_token: boolean = true
  ): Promise<void> {
    // console.debug({ fen_position });
    await this._prepare_for_new_position(send_ucinewgame_token);
    this._put(`position fen ${fen_position}`);
  }

  /**
   * Sets current board position.
   *
   * @param moves A list of moves to set this position on the board. Must be in full algebraic notation.
   */
  async set_position(moves?: string[]): Promise<void> {
    await this.set_fen_position(Stockfish.STARTING_POSITION_FEN, true);
    await this.make_moves_from_current_position(moves);
  }

  /**
   * Sets a new position by playing the moves from the current position.
   *
   * @param moves A list of moves to play in the current position, in order to reach a new position. Must be in full algebraic notation.
   */
  async make_moves_from_current_position(moves?: string[]): Promise<void> {
    if (!moves?.length) return;
    await this._prepare_for_new_position(false);
    for (const move of moves) {
      if (!(await this.is_move_correct(move))) {
        throw new Error(`Cannot make move: ${move}`);
      }
      const fen_position = await this.get_fen_position();
      // console.debug({ fen_position });
      this._put(`position fen ${fen_position} moves ${move}`);
    }
  }

  /**
   * Returns a visual representation of the current board position.
   *
   * @param perspective_white A boolean that indicates whether the board should be displayed from the perspective of white. `true` indicates White's perspective.
   *
   * @returns String of visual representation of the chessboard with its pieces in current position.
   *
   * For example:
   * ```text
   * +---+---+---+---+---+---+---+---+
   * | r | n | b | q | k | b | n | r | 8
   * +---+---+---+---+---+---+---+---+
   * | p | p | p | p | p | p | p | p | 7
   * +---+---+---+---+---+---+---+---+
   * |   |   |   |   |   |   |   |   | 6
   * +---+---+---+---+---+---+---+---+
   * |   |   |   |   |   |   |   |   | 5
   * +---+---+---+---+---+---+---+---+
   * |   |   |   |   |   |   |   |   | 4
   * +---+---+---+---+---+---+---+---+
   * |   |   |   |   |   |   |   |   | 3
   * +---+---+---+---+---+---+---+---+
   * | P | P | P | P | P | P | P | P | 2
   * +---+---+---+---+---+---+---+---+
   * | R | N | B | Q | K | B | N | R | 1
   * +---+---+---+---+---+---+---+---+
   *   a   b   c   d   e   f   g   h
   * ```
   */
  async get_board_visual(perspective_white: boolean = true): Promise<string> {
    this._put("d");
    const board_rep_lines: string[] = [];
    let count_lines: number = 0;
    //         while count_lines < 17:
    //             board_str: string = this._read_line()
    //             if "+" in board_str or "|" in board_str:
    //                 count_lines += 1
    //                 if perspective_white:
    //                     board_rep_lines.append(f"{board_str}")
    //                 else:
    //                     # If the board is to be shown from black's point of view, all lines are
    //                     # inverted horizontally and at the end the order of the lines is reversed.
    //                     board_part = board_str[:33]
    //                     # To keep the displayed numbers on the right side,
    //                     # only the string representing the board is flipped.
    //                     number_part = board_str[33:] if len(board_str) > 33 else ""
    //                     board_rep_lines.append(f"{board_part[::-1]}{number_part}")

    if (!perspective_white) {
      //             board_rep_lines = board_rep_lines[::-1]
    }

    const board_str = await this._read_line();

    //         if "a   b   c" in board_str:
    //             # Engine being used is recent enough to have coordinates, so add them:
    //             if perspective_white:
    //                 board_rep_lines.append(f"  {board_str}")
    //             else:
    //                 board_rep_lines.append(f"  {board_str[::-1]}")

    await this._discard_remaining_stdout_lines("Checkers");
    // "Checkers" is in the last line outputted by Stockfish for the "d" command.
    const board_rep = board_rep_lines.join("\n") + "\n";
    return board_rep;
  }

  /**
   * Returns current board position in Forsyth-Edwards notation (FEN).
   *
   * @returns String of current board position in Forsyth-Edwards notation (FEN). For example: `"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"`
   */
  async get_fen_position(): Promise<string> {
    this._put("d");
    while (true) {
      const text = await this._read_line();
      const splitted_text = text.split(" ");
      if (splitted_text[0] === "Fen:") {
        await this._discard_remaining_stdout_lines("Checkers");
        return splitted_text.slice(1).join(" ");
      }
    }
  }

  /**
   * Sets current skill level of stockfish engine.
   *
   * @param skill_level Skill Level option between 0 (weakest level) and 20 (full strength)
   */
  async set_skill_level(skill_level: number = 20): Promise<void> {
    await this.update_engine_parameters({
      UCI_LimitStrength: false,
      "Skill Level": skill_level,
    });
  }

  /**
   * Sets current Elo rating of Stockfish engine, ignoring skill level.
   *
   * @param elo_rating Aim for an engine strength of the given Elo
   */
  async set_elo_rating(elo_rating: number = 1350): Promise<void> {
    await this.update_engine_parameters({
      UCI_LimitStrength: true,
      UCI_Elo: elo_rating,
    });
  }

  /**
   * Puts Stockfish back to full strength, if you've previously lowered the elo or skill level.
   */
  async resume_full_strength(): Promise<void> {
    await this.update_engine_parameters({
      UCI_LimitStrength: false,
      "Skill Level": 20,
    });
  }

  /**
   * Sets current depth of Stockfish engine.
   */
  set_depth(depth: number = this._DEFAULT_DEPTH): void {
    if (depth < 1) {
      throw new TypeError("depth must be an integer higher than 0");
    }
    this._depth = depth;
  }

  /**
   * Returns configured depth to search
   */
  get_depth(): number {
    return this._depth;
  }

  /**
   * Sets current number of nodes of Stockfish engine.
   */
  set_num_nodes(num_nodes: number = this._DEFAULT_NUM_NODES): void {
    if (num_nodes < 1) {
      throw new TypeError("num_nodes must be an integer higher than 0");
    }
    this._num_nodes = num_nodes;
  }

  /**
   * Returns configured number of nodes to search
   */
  get_num_nodes(): number {
    return this._num_nodes;
  }

  /**
   * Sets perspective of centipawn and WDL evaluations.
   *
   * @param turn_perspective whether perspective is turn-based. Default `true`. If `false`, returned evaluations are from White's perspective.
   */
  set_turn_perspective(turn_perspective: boolean = true): void {
    this._turn_perspective = turn_perspective;
  }

  /**
   * Returns whether centipawn and WDL values are set from turn perspective.
   */
  get_turn_perspective(): boolean {
    return this._turn_perspective;
  }

  /**
   * Returns best move with current position on the board.
   * `wtime` and `btime` arguments influence the search only if provided.
   *
   * @param wtime Time for white player in milliseconds (int)
   * @param btime Time for black player in milliseconds (int)
   *
   * @returns A string of move in algebraic notation, or `null` if it's a mate now.
   */
  async get_best_move(options?: { wtime?: number; btime?: number }) {
    const { wtime, btime } = { ...options };
    if (wtime !== undefined || btime !== undefined) {
      this._go_remaining_time(wtime, btime);
    } else {
      this._go();
    }
    return this._get_best_move_from_sf_popen_process();
  }

  /**
   * Returns best move with current position on the board after a determined time
   *
   * @param time Time for Stockfish to determine best move in milliseconds (int)
   *
   * @returns A string of move in algebraic notation, or `null` if it's a mate now.
   */
  async get_best_move_time(time: number = 1000): Promise<string | null> {
    this._go_time(time);
    return this._get_best_move_from_sf_popen_process();
  }

  /**
   * Precondition - a "go" command must have been sent to SF before calling this function.
   * This function needs existing output to read from the SF popen process.
   */
  private async _get_best_move_from_sf_popen_process(): Promise<string | null> {
    const lines: string[] = await this._get_sf_go_command_output();
    this.info = lines[-2];
    const last_line_split = lines.at(-1).split(" ");
    if (last_line_split[1] === "(none)") return null;
    return last_line_split[1];
  }

  /**
   * Precondition - a "go" command must have been sent to SF before calling this function.
   * This function needs existing output to read from the SF popen process.
   *
   * A list of strings is returned, where each string represents a line of output.
   */
  private async _get_sf_go_command_output(): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      lines.push(await this._read_line());
      if (lines.at(-1).startsWith("bestmove")) {
        // The "bestmove" line is the last line of the output.
        return lines;
      }
    }
  }

  private static _is_fen_syntax_valid(fen: string): boolean {
    // # Code for this function taken from: https://gist.github.com/Dani4kor/e1e8b439115878f8c6dcf127a4ed5d3e
    // # Some small changes have been made to the code.
    // if not re.match(
    //     r"\s*^(((?:[rnbqkpRNBQKP1-8]+\/){7})[rnbqkpRNBQKP1-8]+)\s([b|w])\s(-|[K|Q|k|q]{1,4})\s(-|[a-h][1-8])\s(\d+\s\d+)$",
    //     fen,
    // ):
    //     return false

    const fen_fields = fen.split(/\s+/);

    // if any(
    //     (
    //         len(fen_fields) != 6,
    //         len(fen_fields[0].split("/")) != 8,
    //         any(x not in fen_fields[0] for x in "Kk"),
    //         any(not fen_fields[x].isdigit() for x in (4, 5)),
    //         int(fen_fields[4]) >= int(fen_fields[5]) * 2,
    //     )
    // ):
    //     return false

    // for fenPart in fen_fields[0].split("/"):
    //     field_sum: number = 0
    //     previous_was_digit: boolean = false
    //     for c in fenPart:
    //         if "1" <= c <= "8":
    //             if previous_was_digit:
    //                 return false  # Two digits next to each other.
    //             field_sum += int(c)
    //             previous_was_digit = true
    //         elif c in Stockfish._PIECE_CHARS:
    //             field_sum += 1
    //             previous_was_digit = false
    //         else:
    //             return false  # Invalid character.
    //     if field_sum != 8:
    //         return false  # One of the rows doesn't have 8 columns.

    return true;
  }

  /**
   * Checks if FEN string is valid.
   */
  is_fen_valid(fen: string) {
    if (!Stockfish._is_fen_syntax_valid(fen)) {
      return false;
    }

    //         temp_sf: Stockfish = Stockfish(path=this._path, parameters={"Hash": 1})
    //         # Using a new temporary SF instance, in case the fen is an illegal position that causes
    //         # the SF process to crash.
    //         best_move: string | null = null
    //         temp_sf.set_fen_position(fen, false)
    //         try:
    //             temp_sf._put("go depth 10")
    //             best_move = temp_sf._get_best_move_from_sf_popen_process()
    //         except StockfishException:
    //             # If a StockfishException is thrown, then it happened in read_line() since the SF process crashed.
    //             # This is likely due to the position being illegal, so set the var to false:
    //             return false
    //         else:
    //             return best_move is not null
    //         finally:
    //             temp_sf.__del__()
    //             # Calling this function before returning from either the except or else block above.
    //             # The __del__ function should generally be called implicitly by python when this
    //             # temp_sf object goes out of scope, but calling it explicitly guarantees this will happen.
  }

  /**
   * Checks new move.
   *
   * @param move_value New move value in algebraic notation.
   *
   * @returns `true` if new move is correct, otherwise `false`.
   */
  async is_move_correct(move_value: string): Promise<boolean> {
    const old_self_info = this.info;
    this._put(`go depth 1 searchmoves ${move_value}`);
    const is_move_correct =
      (await this._get_best_move_from_sf_popen_process()) !== null;
    this.info = old_self_info;
    return is_move_correct;
  }

  /**
   * Returns Stockfish's win/draw/loss stats for the side to move.
   *
   * @returns A tuple of three integers, unless the game is over, in which case `null` is returned.
   */
  async get_wdl_stats() {
    if (!this.does_current_engine_version_have_wdl_option()) {
      throw new Error(
        "Your version of Stockfish isn't recent enough to have the UCI_ShowWDL option."
      );
    }

    if (this._on_weaker_setting()) {
      this._weaker_setting_warning(
        "get_wdl_stats will still return full strength Stockfish's wdl stats of the position."
      );
    }

    this._go();
    const lines = await this._get_sf_go_command_output();

    if (lines.at(-1)?.startsWith("bestmove (none)")) {
      return null;
    }

    // split_line = [line.split(" ") for line in lines if " multipv 1 " in line][-1]
    // wdl_index = split_line.index("wdl")
    // wdl_stats = [int(split_line[i]) for i in range(wdl_index + 1, wdl_index + 4)]

    // return [wdl_stats[0], wdl_stats[1], wdl_stats[2]]
  }

  /**
   * Returns whether the user's version of Stockfish has the option to display WDL stats.
   *
   * @returns `true` if Stockfish has the `WDL` option, otherwise `false`.
   */
  async does_current_engine_version_have_wdl_option(): Promise<boolean> {
    this._put("uci");
    while (true) {
      const splitted_text = (await this._read_line()).split(" ");
      if (splitted_text[0] == "uciok") {
        return false;
      } else if (splitted_text.includes("UCI_ShowWDL")) {
        await this._discard_remaining_stdout_lines("uciok");
        return true;
      }
    }
  }

  /**
   * Searches to the specified depth and evaluates the current position.
   *
   * @param searchtime Time for Stockfish to evaluate in milliseconds
   *
   * @returns A dictionary of two pairs: {str: string, str: number}
   *             - The first pair describes the type of the evaluation. The key is "type", and the value
   *               will be either "cp" (centipawns) or "mate".
   *             - The second pair describes the value of the evaluation. The key is "value", and the value
   *               will be an int (representing either a cp value or a mate in n value).
   */
  get_evaluation(searchtime?: number) {
    //         if this._on_weaker_setting():
    //             this._weaker_setting_warning(
    //                 + """ get_evaluation will still return full strength Stockfish's evaluation of the position."""
    //             )

    //         compare: number = 1 if this.get_turn_perspective() or ("w" in this.get_fen_position()) else -1
    //         # If the user wants the evaluation specified relative to who is to move, this will be done.
    //         # Otherwise, the evaluation will be in terms of white's side (positive meaning advantage white,
    //         # negative meaning advantage black).

    if (!searchtime) {
      this._go();
    } else {
      this._go_time(searchtime);
    }

    const lines = this._get_sf_go_command_output();
    //         split_line = [line.split(" ") for line in lines if line.startswith("info")][-1]
    //         score_index = split_line.index("score")
    //         eval_type, val = split_line[score_index + 1], split_line[score_index + 2]
    //         return {"type": eval_type, "value": number(val) * compare}
  }

  /**
   * Sends the 'eval' command to stockfish to get the static evaluation. The current position is 'directly' evaluated -- i.e., no search is involved.
   *
   * @returns A decimal representing the static eval, unless one side is in check or checkmated, in which case `null` is returned.
   */
  async get_static_eval(): Promise<number | null> {
    // // Stockfish gives the static eval from white's perspective:
    // compare: number = (
    //     1 if not this.get_turn_perspective() or ("w" in this.get_fen_position()) else -1
    // )

    this._put("eval");

    while (true) {
      const text = await this._read_line();
      // if any(text.startswith(x) for x in ("Final evaluation", "Total Evaluation")):
      //     static_eval = text.split()[2]
      //     if " none " not in text:
      //         this._read_line()
      //         # Consume the remaining line (for some reason `eval` outputs an extra newline)
      //     if static_eval == "none":
      //         assert "(in check)" in text
      //         return null
      //     else:
      //         return float(static_eval) * compare
    }
  }

  /**
   * Returns info on the top moves in the position.
   *
   * @param num_top_moves The number of moves for which to return information, assuming there are at least that many legal moves. Default is 5.
   *
   * @param verbose Option to include the full info from the engine in the returned dictionary,
   *                including `seldepth`, `multipv`, `time`, `nodes`, `nps`, and `wdl` if available. Default is `false`.
   *
   * @param num_nodes Option to search until a certain number of nodes have been searched, instead of depth. Default is 0.
   *
   * Returns:
   *               A list of dictionaries, where each dictionary contains keys for `Move`, `Centipawn`, and `Mate`.
   *               The corresponding value for either the `Centipawn` or `Mate` key will be `null`.
   *               If there are no moves in the position, an empty list is returned.
   *
   *               If `verbose` is `true`, the dictionary will also include the following keys: `SelectiveDepth`, `Time`,
   *               `Nodes`, `NodesPerSecond`, `MultiPVLine`, and `WDL` (if available).
   */
  get_top_moves(
    num_top_moves: number = 5,
    verbose: boolean = false,
    num_nodes: number = 0
  ) {
    // if num_top_moves <= 0:
    //     raise ValueError("num_top_moves is not a positive number.")
    // if this._on_weaker_setting():
    //     this._weaker_setting_warning(
    //         + """ get_top_moves will still return the top moves of full strength Stockfish."""
    //     )
    // # remember global values
    // old_multipv: number = this._parameters["MultiPV"]
    // old_num_nodes: number = this._num_nodes
    // # to get number of top moves, we use Stockfish's MultiPV option (i.e., multiple principal variations).
    // # set MultiPV to num_top_moves requested
    // if num_top_moves != this._parameters["MultiPV"]:
    //     this._set_option("MultiPV", num_top_moves)
    // # start engine. will go until reaches this._depth or this._num_nodes
    // if num_nodes == 0:
    //     this._go()
    // else:
    //     this._num_nodes = num_nodes
    //     this._go_nodes()
    // lines: list[string[]] = [line.split(" ") for line in this._get_sf_go_command_output()]
    // # Stockfish is now done evaluating the position,
    // # and the output is stored in the list 'lines'
    // top_moves: list[dict[str, str | int | null]] = []
    // # Set perspective of evaluations. If get_turn_perspective() is true, or white to move,
    // # use Stockfish's values -- otherwise, invert values.
    // perspective: number = (
    //     1 if this.get_turn_perspective() or ("w" in this.get_fen_position()) else -1
    // )
    // # loop through Stockfish output lines in reverse order
    // for line in reversed(lines):
    //     # If the line is a "bestmove" line, and the best move is "(none)", then
    //     # there are no top moves, and we're done. Otherwise, continue with the next line.
    //     if line[0] == "bestmove":
    //         if line[1] == "(none)":
    //             top_moves = []
    //             break
    //         continue
    //     # if the line has no relevant info, we're done
    //     if ("multipv" not in line) or ("depth" not in line):
    //         break
    //     # if we're searching depth and the line is not our desired depth, we're done
    //     if (num_nodes == 0) and (int(this._pick(line, "depth")) != this._depth):
    //         break
    //     # if we're searching nodes and the line has less than desired number of nodes, we're done
    //     if (num_nodes > 0) and (int(this._pick(line, "nodes")) < this._num_nodes):
    //         break
    //     move_evaluation: dict[str, str | int | null] = {
    //         # get move
    //         "Move": this._pick(line, "pv"),
    //         # get cp if available
    //         "Centipawn": (int(this._pick(line, "cp")) * perspective if "cp" in line else null),
    //         # get mate if available
    //         "Mate": (int(this._pick(line, "mate")) * perspective if "mate" in line else null),
    //     }
    //     # add more info if verbose
    //     if verbose:
    //         move_evaluation["Time"] = this._pick(line, "time")
    //         move_evaluation["Nodes"] = this._pick(line, "nodes")
    //         move_evaluation["MultiPVLine"] = this._pick(line, "multipv")
    //         move_evaluation["NodesPerSecond"] = this._pick(line, "nps")
    //         move_evaluation["SelectiveDepth"] = this._pick(line, "seldepth")
    //         # add wdl if available
    //         if this.does_current_engine_version_have_wdl_option():
    //             move_evaluation["WDL"] = " ".join(
    //                 [
    //                     this._pick(line, "wdl", 1),
    //                     this._pick(line, "wdl", 2),
    //                     this._pick(line, "wdl", 3),
    //                 ][::perspective]
    //             )
    //     # add move to list of top moves
    //     top_moves.insert(0, move_evaluation)
    // # reset MultiPV to global value
    // if old_multipv != this._parameters["MultiPV"]:
    //     this._set_option("MultiPV", old_multipv)
    // # reset this._num_nodes to global value
    // if old_num_nodes != this._num_nodes:
    //     this._num_nodes = old_num_nodes
    // return top_moves
  }

  /**
   * Returns perft information of the current position for a given depth
   *
   * @param depth The search depth given as an integer (1 or higher)
   */
  async get_perft(depth: number) {
    // if not isinstance(depth, int) or depth < 1 or isinstance(depth, bool):
    //     raise TypeError("depth must be an integer higher than 0")

    this._go_perft(depth);

    // move_possibilities: dict[str, int] = {}
    // num_nodes = 0
    // while true:
    //     line = this._read_line()
    //     if line == "":
    //         continue
    //     if "searched" in line:
    //         num_nodes = int(line.split(":")[1])
    //         break
    //     move, num = line.split(":")
    //     assert move not in move_possibilities
    //     move_possibilities[move] = int(num)
    // this._read_line()  # Consumes the remaining newline stockfish outputs.
    // return num_nodes, move_possibilities
  }

  /**
   * Flip the side to move
   */
  flip(): void {
    this._put("flip");
  }

  _pick(line: string[], value: string = "", index: number = 1): string {
    return line[line.indexOf(value) + index];
  }

  /**
   * Returns what is on the specified square.
   *
   * @param square The coordinate of the square in question, eg. e4.
   *
   * @returns object if the square is empty.
   */
  async get_what_is_on_square(square: string) {
    const file_letter: string = square[0].toLowerCase();
    const rank_num: number = parseInt(square[1]);

    //         if (
    //             len(square) != 2
    //             or file_letter < "a"
    //             or file_letter > "h"
    //             or square[1] < "1"
    //             or square[1] > "8"
    //         ):
    //             raise ValueError("square argument to the get_what_is_on_square function isn't valid.")

    const rank_visual: string = (await this.get_board_visual()).split(/\r?\n/)[
      17 - 2 * rank_num
    ];

    const ord = (c: string): number => [...c][0].codePointAt(0);
    const piece_as_char: string =
      rank_visual[2 + (ord(file_letter) - ord("a")) * 4];

    if (piece_as_char === " ") return null;

    return ReversePieceMap[piece_as_char as keyof typeof ReversePieceMap];
  }

  /**
   * Returns whether the proposed move will be a direct capture, en passant, or not a capture at all.
   *
   * @param move_value The proposed move, in the notation that Stockfish uses. E.g., `"e2e4"`, `"g1f3"`, etc.
   *
   * @returns whether the proposed move will be a direct capture, en passant, or not a capture at all.
   */
  async will_move_be_a_capture(move_value: string) {
    if (!this.is_move_correct(move_value)) {
      throw new Error(
        "The proposed move is not valid in the current position."
      );
    }

    const starting_square_piece = await this.get_what_is_on_square(
      move_value.slice(0, 2)
    );
    const ending_square_piece = await this.get_what_is_on_square(
      move_value.slice(2, 4)
    );

    if (ending_square_piece !== null) {
      if (!this._parameters["UCI_Chess960"]) {
        return Capture.DIRECT_CAPTURE;
      } else {
        // Check for Chess960 castling:
        const castling_pieces = [
          [Piece.WHITE_KING, Piece.WHITE_ROOK],
          [Piece.BLACK_KING, Piece.BLACK_ROOK],
        ];

        // if [starting_square_piece, ending_square_piece] in castling_pieces:
        //     return Capture.NO_CAPTURE
        // else:
        //     return Capture.DIRECT_CAPTURE
      }
    } else if (
      move_value.slice(2, 4) ===
        (await this.get_fen_position()).split(" ")[3] &&
      [Piece.WHITE_PAWN, Piece.BLACK_PAWN].includes(starting_square_piece)
    ) {
      return Capture.EN_PASSANT;
    } else {
      return Capture.NO_CAPTURE;
    }
  }

  /**
   * Returns Stockfish engine full version.
   */
  get_stockfish_full_version(): number {
    return this._version.full;
  }

  /**
   * Returns Stockfish engine major version.
   */
  get_stockfish_major_version(): number {
    return this._version.major;
  }

  /**
   * Returns Stockfish engine minor version.
   */
  get_stockfish_minor_version(): number {
    return this._version.minor;
  }

  /**
   * Returns Stockfish engine patch version.
   */
  get_stockfish_patch_version(): string {
    return this._version.patch;
  }

  /**
   * Returns Stockfish engine build version.
   */
  get_stockfish_sha_version(): string {
    return this._version.sha;
  }

  /**
   * Returns whether the version of Stockfish being used is a development build.
   *
   * @returns `true` if the version of Stockfish being used is a development build, `false` otherwise.
   */
  is_development_build_of_engine(): boolean {
    return this._version.is_dev_build;
  }

  private async _set_stockfish_version(): Promise<void> {
    this._put("uci");
    // read version text:
    while (true) {
      const line = await this._read_line();
      if (line.startsWith("id name")) {
        await this._discard_remaining_stdout_lines("uciok");
        this._parse_stockfish_version(line.split(" ")[3]);
        return;
      }
    }
  }

  private _parse_stockfish_version(version_text: string = ""): void {
    try {
      this._version = {
        full: 0,
        major: 0,
        minor: 0,
        patch: "",
        sha: "",
        is_dev_build: false,
        text: version_text,
      };
      // check if version is a development build, eg. dev-20221219-61ea1534
      if (this._version.text.startsWith("dev-")) {
        this._version.is_dev_build = true;
        // parse patch and sha from dev version text
        this._version.patch = this._version.text.split("-")[1];
        this._version.sha = this._version.text.split("-")[2];
        // get major.minor version as text from build date
        const build_date = this._version["text"].split("-")[1];
        // date_string = (
        //     f"{int(build_date[:4])}-{int(build_date[4:6]):02d}-{int(build_date[6:8]):02d}"
        // )
        // this._version["text"] = this._get_stockfish_version_from_build_date(date_string)
      }

      // // check if version is a development build, eg. 280322
      // if len(this._version["text"]) == 6:
      //     this._version["is_dev_build"] = true
      //     // parse version number from DDMMYY
      //     this._version["patch"] = this._version["text"]
      //     // parse build date from dev version text
      //     build_date = this._version["text"]
      //     date_string = f"20{build_date[4:6]}-{build_date[2:4]}-{build_date[0:2]}"
      //     this._version["text"] = this._get_stockfish_version_from_build_date(date_string)

      // // parse version number for all versions
      // this._version.major = int(this._version["text"].split(".")[0])
      // try:
      //     this._version.minor = int(this._version["text"].split(".")[1])
      // except IndexError:
      //     this._version.minor = 0
      // this._version.full = this._version.major + this._version.minor / 10
    } catch (e) {
      throw new Error(
        "Unable to parse Stockfish version. You may be using an unsupported version of Stockfish.",
        { cause: e }
      );
    }
  }

  private _get_stockfish_version_from_build_date(date_string: string = "") {
    // Convert date string to datetime object
    const date_object = new Date(date_string);
    // Convert release date strings to datetime objects
    const releases_datetime = Object.fromEntries(
      Object.entries(this._RELEASES).map(([key, value]) => [
        key,
        new Date(value),
      ])
    );

    // Find the key for the given date
    let key_for_date = null;
    for (const [key, value] in Object.entries(releases_datetime)) {
      // if value <= date_object:
      //     if key_for_date is null or value > releases_datetime[key_for_date]:
      //         key_for_date = key
    }

    if (key_for_date === null) {
      throw new Error(
        "There was a problem with finding the release associated with the engine publish date."
      );
    }

    return key_for_date;
  }

  /**
   * Sends the 'quit' command to the Stockfish engine, getting the process to stop.
   */
  send_quit_command(): void {
    if (this._stockfish.exitCode === undefined) {
      this._put("quit");
      while (this._stockfish.exitCode === undefined);
    }
  }

  //     @dataclass
  //     class BenchmarkParameters:
  //         ttSize: number = 16
  //         threads: number = 1
  //         limit: number = 13
  //         fenFile: string = "default"
  //         limitType: string = "depth"
  //         evalType: string = "mixed"

  //          __post_init__(this):
  //             this.ttSize = this.ttSize if this.ttSize in range(1, 128001) else 16
  //             this.threads = this.threads if this.threads in range(1, 513) else 1
  //             this.limit = this.limit if this.limit in range(1, 10001) else 13
  //             this.fenFile = (
  //                 this.fenFile
  //                 if this.fenFile.endswith(".fen") and os.path.isfile(this.fenFile)
  //                 else "default"
  //             )
  //             this.limitType = (
  //                 this.limitType
  //                 if this.limitType in ["depth", "perft", "nodes", "movetime"]
  //                 else "depth"
  //             )
  //             this.evalType = (
  //                 this.evalType if this.evalType in ["mixed", "classical", "NNUE"] else "mixed"
  //             )

  /**
   * Benchmark will run the bench command with BenchmarkParameters.
   * It is an Additional custom non-UCI command, mainly for debugging.
   * Do not use this command during a search!
   */
  //      benchmark(params: BenchmarkParameters): string

  //         if type(params) != this.BenchmarkParameters:
  //             params = this.BenchmarkParameters()

  //         this._put(
  //             f"bench {params.ttSize} {params.threads} {params.limit} {params.fenFile} {params.limitType} {params.evalType}"
  //         )
  //         while true:
  //             text = this._read_line()
  //             if text.split(" ")[0] == "Nodes/second":
  //                 return text
}

export class StockfishError extends Error {}

class BrokenPipeError extends Error {
  override readonly name = "BrokenPipeError";
  readonly code = "EPIPE";

  constructor(message = "Broken pipe") {
    super(message);
  }
}
