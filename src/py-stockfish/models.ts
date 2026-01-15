export enum Piece {
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

export enum Capture {
  DIRECT_CAPTURE = "direct capture",
  EN_PASSANT = "en passant",
  NO_CAPTURE = "no capture",
}

interface StockfishParameters {
  readonly "Debug Log File": string;
  readonly Threads: number;
  readonly Ponder: boolean;
  readonly Hash: number;
  readonly MultiPV: number;
  readonly "Skill Level": number;
  readonly "Move Overhead": number;
  readonly UCI_Chess960: boolean;
  readonly UCI_LimitStrength: boolean;
  readonly UCI_Elo: number;
  readonly UCI_ShowWDL: boolean;
}

type StockfishParametersKey = keyof StockfishParameters;

/**
 * https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands
 */
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
  private static readonly _RELEASES = {
    "17.1": "2025-03-30",
    "17.0": "2024-09-06",
    "16.1": "2024-02-24",
    "16.0": "2023-06-30",
  } as const;

  private static readonly _PIECE_CHARS = [
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
   * https://github.com/official-stockfish/Stockfish/blob/c12dbdedd9366bc7ffb29b355038bc7dea5f9c48/src/engine.cpp#L63-L138
   */
  private static readonly _PARAM_RESTRICTIONS = {
    "Debug Log File": ["string", null, null],
    Threads: ["number", 1, 1024],
    Hash: ["number", 1, 2048],
    Ponder: ["boolean", null, null],
    MultiPV: ["number", 1, 500],
    "Skill Level": ["number", 0, 20],
    "Move Overhead": ["number", 0, 5000],
    UCI_Chess960: ["boolean", null, null],
    UCI_LimitStrength: ["boolean", null, null],
    UCI_Elo: ["number", 1320, 3190],
    UCI_ShowWDL: ["boolean", null, null],
  } as const satisfies Record<
    StockfishParametersKey,
    ["number", number, number] | ["string" | "boolean", null, null]
  >;

  public static readonly DEFAULT_STOCKFISH_PARAMS: StockfishParameters = {
    "Debug Log File": "",
    Threads: 1,
    Ponder: false,
    Hash: 16,
    MultiPV: 1,
    "Skill Level": 20,
    "Move Overhead": 10,
    UCI_Chess960: false,
    UCI_LimitStrength: false,
    UCI_Elo: 1350,
    UCI_ShowWDL: false,
  } as const satisfies StockfishParameters;

  private info: string = "";

  private _has_quit_command_been_sent: boolean = false;
  private _parameters: StockfishParameters = Stockfish.DEFAULT_STOCKFISH_PARAMS;

  #path!: string;
  #stockfish!: Bun.Subprocess<"pipe", "pipe", "pipe">;
  #stdoutReader!: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  #lineBuffer: string = "";

  public static readonly DEFAULT_NUM_NODES = 1000000 as const;
  public static readonly DEFAULT_DEPTH = 15 as const;
  public static readonly DEFAULT_TURN_PERSPECTIVE = true as const;

  public static readonly STARTING_POSITION_FEN =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" as const;

  private _num_nodes: number = Stockfish.DEFAULT_NUM_NODES;
  private _depth: number = Stockfish.DEFAULT_DEPTH;
  private _turn_perspective: boolean = Stockfish.DEFAULT_TURN_PERSPECTIVE;

  private _version!: {
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
   * const stockfish = await Stockfish.create();
   * ```
   */
  static async start(options?: {
    path?: string;
    depth?: number;
    parameters?: Partial<StockfishParameters>;
    num_nodes?: number;
    turn_perspective?: boolean;
  }): Promise<Stockfish> {
    const stockfish = new Stockfish();
    const {
      path = "stockfish",
      depth = 15,
      parameters,
      num_nodes = 1000000,
      turn_perspective = true,
    } = { ...options };

    stockfish.#path = path;

    stockfish.#stockfish = Bun.spawn({
      cmd: [path],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    stockfish.#stdoutReader = stockfish.#stockfish.stdout.getReader();

    await stockfish.#set_stockfish_version();
    stockfish.#put("uci");
    await stockfish.#discard_remaining_stdout_lines("uciok");
    stockfish.set_depth(depth);
    stockfish.set_num_nodes(num_nodes);
    stockfish.set_turn_perspective(turn_perspective);
    await stockfish.reset_engine_parameters();
    await stockfish.update_engine_parameters(parameters);
    const does_current_engine_version_have_wdl_option =
      await stockfish.#does_current_engine_version_have_wdl_option();
    if (!does_current_engine_version_have_wdl_option) {
      throw new Error(
        `Your version of Stockfish isn't recent enough to have the UCI_ShowWDL option.\
This means that you are using an unsupported version of Stockfish.`,
      );
    }
    await stockfish._set_option("UCI_ShowWDL", true, false);

    await stockfish.#prepare_for_new_position(true);
    return stockfish;
  }

  /**
   * Returns the current engine parameters being used.
   */
  get_engine_parameters(): StockfishParameters {
    return structuredClone(this._parameters);
  }

  /**
   * Updates the Stockfish engine parameters.
   */
  async update_engine_parameters(
    parameters?: Partial<StockfishParameters>,
  ): Promise<void> {
    if (!parameters) return;

    const new_param_values = structuredClone(parameters);

    for (const key in new_param_values) {
      if (
        Object.keys(this._parameters).length > 0 &&
        !(key in this._parameters)
      ) {
        throw new Error(`'${key}' is not a key that exists.`);
      }

      this.#validate_param_value(key, new_param_values[key]);
    }

    if (
      "Skill Level" in new_param_values !== "UCI_Elo" in new_param_values &&
      !("UCI_LimitStrength" in new_param_values)
    ) {
      // This means the user wants to update the Skill Level or UCI_Elo (only one, not both),
      // and that they didn't specify a new value for UCI_LimitStrength.
      // So, update UCI_LimitStrength, in case it's not the right value currently.
      if ("Skill Level" in new_param_values) {
        Object.assign(new_param_values, { UCI_LimitStrength: false });
      } else if ("UCI_Elo" in new_param_values) {
        Object.assign(new_param_values, { UCI_LimitStrength: true });
      }
    }

    if ("Threads" in new_param_values) {
      // Recommended to set the hash param after threads.
      const threads_value = new_param_values.Threads;
      delete new_param_values.Threads;
      let hash_value = null;
      if ("Hash" in new_param_values) {
        hash_value = new_param_values.Hash;
        delete new_param_values.Hash;
      } else {
        hash_value = this._parameters.Hash;
      }
      new_param_values.Threads = threads_value;
      new_param_values.Hash = hash_value;
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

  async #prepare_for_new_position(
    send_ucinewgame_token: boolean = true,
  ): Promise<void> {
    if (send_ucinewgame_token) {
      this.#put("ucinewgame");
    }
    await this.#isReady();
    this.info = "";
  }

  #put(command: UCICommand): void {
    // console.debug({ command });

    if (!this.#stockfish.stdin) {
      throw new BrokenPipeError();
    }

    if (this.has_quit) {
      return;
    }

    if (!this._has_quit_command_been_sent) {
      this.#stockfish.stdin.write(`${command}\n`);
      this.#stockfish.stdin.flush();
      if (command === "quit") {
        this._has_quit_command_been_sent = true;
      }
    }
  }

  async #readline(): Promise<string> {
    if (!this.#stockfish.stdout) {
      throw new BrokenPipeError();
    }
    if (this.has_quit) {
      throw new StockfishError("The Stockfish process has crashed", "crashed");
    }
    while (true) {
      // console.debug({ _lineBuffer: this._lineBuffer });
      const newlineIndex = this.#lineBuffer.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = this.#lineBuffer.slice(0, newlineIndex).trim();
        this.#lineBuffer = this.#lineBuffer.slice(newlineIndex + 1);
        // console.debug({ line });
        if (line.length === 0) continue;
        return line;
      }
      const readerPromise = this.#stdoutReader.read();
      const exitPromise = this.#stockfish.exited.then(() => {
        throw new StockfishError(
          "The Stockfish process has crashed",
          "crashed",
        );
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new StockfishError("Read Timeout", "readtimeout"));
        }, 5000),
      );
      // console.debug("Waiting for readerPromise...");
      const { value, done } = await Promise.race([
        readerPromise,
        exitPromise,
        timeoutPromise,
      ]);
      // console.debug("readerPromise done");
      if (done) {
        if (this.#lineBuffer.length > 0) {
          const line = this.#lineBuffer.trim();
          this.#lineBuffer = "";
          // console.debug({ line });
          if (line.length === 0) continue;
          return line;
        }
        if (this._has_quit_command_been_sent) return "";
        throw new StockfishError("Stream ended unexpectedly", "streamended");
      }
      this.#lineBuffer += new TextDecoder().decode(value, { stream: true });
    }
  }

  /**
   * Calls `#readline()` until encountering `substr_in_last_line` in the line.
   */
  async #discard_remaining_stdout_lines(
    substr_in_last_line: string,
  ): Promise<void> {
    while (!(await this.#readline()).includes(substr_in_last_line));
  }

  private async _set_option<T extends keyof StockfishParameters>(
    name: T,
    value: StockfishParameters[T],
    update_parameters_attribute: boolean = true,
  ): Promise<void> {
    this.#validate_param_value(name, value);
    const str_rep_value = String(value);
    this.#put(`setoption name ${name} value ${str_rep_value}`);
    if (update_parameters_attribute) {
      Object.assign(this._parameters, { [name]: value });
    }
    await this.#isReady();
  }

  #validate_param_value<T extends keyof StockfishParameters>(
    name: T,
    value: StockfishParameters[T],
  ): void {
    if (!(name in Stockfish._PARAM_RESTRICTIONS)) {
      throw new Error(`${name} is not a supported engine parameter`);
    }

    const [required_type, minimum, maximum] =
      Stockfish._PARAM_RESTRICTIONS[name];

    if (typeof value !== required_type) {
      throw new TypeError(`${value} is not of type ${required_type}`);
    }

    if (minimum !== null && typeof value === "number" && value < minimum) {
      throw new Error(
        `${value} is below ${name}'s minimum value of ${minimum}`,
      );
    }

    if (maximum !== null && typeof value === "number" && value > maximum) {
      throw new Error(`${value} is over ${name}'s maximum value of ${maximum}`);
    }
  }

  async #isReady(): Promise<void> {
    this.#put("isready");
    while (true) {
      const line = await this.#readline();
      if (line === "readyok") return;
    }
  }

  #go(): void {
    this.#put(`go depth ${this._depth}`);
  }

  #go_nodes(): void {
    this.#put(`go nodes ${this._num_nodes}`);
  }

  #go_time(time: number): void {
    this.#put(`go movetime ${time}`);
  }

  #go_remaining_time(wtime?: number, btime?: number): void {
    let cmd = "go";
    if (wtime !== undefined) {
      cmd += ` wtime ${wtime}`;
    }
    if (btime !== undefined) {
      cmd += ` btime ${btime}`;
    }
    this.#put(cmd);
  }

  #go_perft(depth: number): void {
    this.#put(`go perft ${depth}`);
  }

  private _on_weaker_setting(): boolean {
    return (
      this._parameters.UCI_LimitStrength || this._parameters["Skill Level"] < 20
    );
  }

  /**
   * Will issue a warning, referring to the function that calls this one.
   */
  #weaker_setting_warning(message: string): void {
    console.warn(
      `Note that even though you've set Stockfish to play on a weaker elo or skill level, ${message}`,
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
    send_ucinewgame_token: boolean = true,
  ): Promise<void> {
    // console.debug({ fen_position });
    await this.#prepare_for_new_position(send_ucinewgame_token);
    this.#put(`position fen ${fen_position}`);
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
    // console.debug({ moves });
    await this.#prepare_for_new_position(false);
    for (const move of moves) {
      // console.debug({ move });
      const is_move_correct = await this.is_move_correct(move);
      // console.debug({ move, is_move_correct });
      if (!is_move_correct) {
        throw new Error(`Cannot make move: ${move}`);
      }
      const fen_position = await this.get_fen_position();
      // console.debug({ fen_position });
      this.#put(`position fen ${fen_position} moves ${move}`);
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
    this.#put("d");
    const board_rep_lines: string[] = [];
    let count_lines: number = 0;
    while (count_lines < 17) {
      const board_str: string = await this.#readline();
      if (board_str.includes("+") || board_str.includes("|")) {
        count_lines += 1;
        if (perspective_white) {
          board_rep_lines.push(`${board_str}`);
        } else {
          // If the board is to be shown from black's point of view, all lines are
          // inverted horizontally and at the end the order of the lines is reversed.
          const board_part = board_str.slice(0, 33);
          // To keep the displayed numbers on the right side, only the string representing the board is flipped.
          const number_part = board_str.length > 33 ? board_str.slice(33) : "";
          board_rep_lines.push(
            `${[...board_part].toReversed().join("")}${number_part}`,
          );
        }
      }
    }

    if (!perspective_white) {
      board_rep_lines.reverse();
    }

    const board_str = await this.#readline();

    if (perspective_white) {
      board_rep_lines.push(`  ${board_str}`);
    } else {
      const reversed_board_str = [...board_str].toReversed().join("");
      board_rep_lines.push(`  ${reversed_board_str}`);
    }

    // "Checkers" is in the last line outputted by Stockfish for the "d" command.
    await this.#discard_remaining_stdout_lines("Checkers");
    const board_rep = board_rep_lines.join("\n") + "\n";
    return board_rep;
  }

  /**
   * Returns current board position in Forsyth-Edwards notation (FEN).
   *
   * @returns String of current board position in Forsyth-Edwards notation (FEN). For example: `"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"`
   */
  async get_fen_position(): Promise<string> {
    this.#put("d");
    while (true) {
      const text = await this.#readline();
      const splitted_text = text.split(/\s+/);
      if (splitted_text[0] === "Fen:") {
        await this.#discard_remaining_stdout_lines("Checkers");
        return splitted_text.slice(1).join(" ");
      }
    }
  }

  /**
   * Sets current skill level of stockfish engine.
   *
   * @param skill_level Skill Level option between 0 (weakest level) and 20 (full strength)
   */
  async set_skill_level(skill_level: number): Promise<void> {
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
  async set_elo_rating(elo_rating: number): Promise<void> {
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
  set_depth(depth: number): void {
    if (typeof depth !== "number" || depth < 1) {
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
  set_num_nodes(num_nodes: number): void {
    if (typeof num_nodes !== "number" || num_nodes < 1) {
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
   * @param turn_perspective whether perspective is turn-based. If `false`, returned evaluations are from White's perspective.
   */
  set_turn_perspective(turn_perspective: boolean): void {
    if (typeof turn_perspective !== "boolean") {
      throw new TypeError("turn_perspective must be a boolean");
    }
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
  async get_best_move(options?: { wtime?: number; btime?: number }): Promise<string | null> {
    const { wtime, btime } = { ...options };
    if (wtime !== undefined || btime !== undefined) {
      this.#go_remaining_time(wtime, btime);
    } else {
      this.#go();
    }
    return this.#get_best_move_from_sf_popen_process();
  }

  /**
   * Returns best move with current position on the board after a determined time
   *
   * @param time Time for Stockfish to determine best move in milliseconds (int)
   *
   * @returns A string of move in algebraic notation, or `null` if it's a mate now.
   */
  async get_best_move_time(time: number = 1000): Promise<string | null> {
    this.#go_time(time);
    return this.#get_best_move_from_sf_popen_process();
  }

  /**
   * Precondition - a "go" command must have been sent to SF before calling this function.
   * This function needs existing output to read from the SF popen process.
   */
  async #get_best_move_from_sf_popen_process(): Promise<string | null> {
    const lines: string[] = await this.#get_sf_go_command_output();
    // console.debug({ lines });
    this.info = lines.at(-2);
    const last_line_split = lines.at(-1).split(/\s+/);
    // console.debug({ last_line_split });
    if (last_line_split[1] === "(none)") return null;
    return last_line_split[1] ?? null;
  }

  /**
   * Precondition - a "go" command must have been sent to SF before calling this function.
   * This function needs existing output to read from the SF popen process.
   *
   * A list of strings is returned, where each string represents a line of output.
   */
  async #get_sf_go_command_output(): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      lines.push(await this.#readline());
      // The "bestmove" line is the last line of the output.
      if (lines.at(-1)?.startsWith("bestmove")) {
        return lines;
      }
    }
  }

  public static is_fen_syntax_valid(fen: string): boolean {
    // Code for this function taken from: https://gist.github.com/Dani4kor/e1e8b439115878f8c6dcf127a4ed5d3e
    // Some small changes have been made to the code.
    if (
      !fen.match(
        /\s*^(((?:[rnbqkpRNBQKP1-8]+\/){7})[rnbqkpRNBQKP1-8]+)\s([b|w])\s(-|[K|Q|k|q]{1,4})\s(-|[a-h][1-8])\s(\d+\s\d+)$/,
      )
    ) {
      return false;
    }

    const fen_fields = fen.split(/\s+/);

    if (
      fen_fields.length !== 6 ||
      fen_fields[0]!.split("/").length !== 8 ||
      !fen_fields[0]!.includes("K") ||
      !fen_fields[0]!.includes("k") ||
      !/^\d+$/.test(fen_fields[4]!) ||
      !/^\d+$/.test(fen_fields[5]!) ||
      parseInt(fen_fields[4]!) >= parseInt(fen_fields[5]!) * 2
    ) {
      return false;
    }

    for (const fenPart of fen_fields[0]!.split("/")) {
      let field_sum: number = 0;
      let previous_was_digit: boolean = false;
      for (const c of fenPart) {
        if ("1" <= c && c <= "8") {
          if (previous_was_digit) {
            return false; // Two digits next to each other.
          }
          field_sum += parseInt(c);
          previous_was_digit = true;
        } else if ((<readonly string[]>Stockfish._PIECE_CHARS).includes(c)) {
          field_sum += 1;
          previous_was_digit = false;
        } else {
          return false; // Invalid character.
        }
      }

      if (field_sum !== 8) {
        return false; // One of the rows doesn't have 8 columns.
      }
    }

    return true;
  }

  /**
   * Checks if FEN string is valid.
   */
  async is_fen_valid(fen: string): Promise<boolean> {
    if (!Stockfish.is_fen_syntax_valid(fen)) {
      return false;
    }

    // Using a new temporary SF instance, in case the fen is an illegal position that causes the SF process to crash.
    const temp_sf = await Stockfish.start({
      path: this.#path,
      parameters: { Hash: 1 },
    });

    await temp_sf.set_fen_position(fen, false);
    try {
      temp_sf.#put("go depth 10");
      const best_move = await temp_sf.#get_best_move_from_sf_popen_process();
      // console.debug({ best_move });
      return best_move !== null;
    } catch (e) {
      // console.debug({ e });
      // If a StockfishError is thrown, then it happened in read_line() since the SF process crashed.
      // This is likely due to the position being illegal, so return false
      if (e instanceof StockfishError) return false;
      return false;
    } finally {
      await temp_sf.kill_stockfish();
    }
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
    this.#put(`go depth 1 searchmoves ${move_value}`);
    // console.debug("in is_move_correct, after go");
    const best_move = await this.#get_best_move_from_sf_popen_process();
    // console.debug("in is_move_correct, after best_move", { best_move });
    const is_move_correct = best_move === move_value;
    // console.debug({ is_move_correct, best_move, move_value });
    this.info = old_self_info;
    return is_move_correct;
  }

  /**
   * Returns Stockfish's win/draw/loss stats for the side to move.
   *
   * @returns A tuple of three integers, unless the game is over, in which case `null` is returned.
   */
  async get_wdl_stats(): Promise<readonly [number, number, number] | null> {
    if (!(await this.#does_current_engine_version_have_wdl_option())) {
      throw new Error(
        `Your version of Stockfish isn't recent enough to have the UCI_ShowWDL option.\
This means that you are using an unsupported version of Stockfish.`,
      );
    }

    if (this._on_weaker_setting()) {
      this.#weaker_setting_warning(
        "get_wdl_stats will still return full strength Stockfish's wdl stats of the position.",
      );
    }

    this.#go();
    const lines = await this.#get_sf_go_command_output();

    if (lines.at(-1)?.startsWith("bestmove (none)")) {
      return null;
    }

    const split_line = lines
      .filter((line) => line.includes(" multipv 1 "))
      .at(-1)!
      .split(/\s+/);

    const wdl_index = split_line.indexOf("wdl");

    const wdl_stats = [
      parseInt(split_line[wdl_index + 1]),
      parseInt(split_line[wdl_index + 2]),
      parseInt(split_line[wdl_index + 3]),
    ] as const;

    return wdl_stats;
  }

  /**
   * Returns whether the user's version of Stockfish has the option to display WDL stats.
   *
   * @returns `true` if Stockfish has the `WDL` option, otherwise `false`.
   */
  async #does_current_engine_version_have_wdl_option(): Promise<boolean> {
    this.#put("uci");
    while (true) {
      const splitted_text = (await this.#readline()).split(/\s+/);
      if (splitted_text[0] === "uciok") {
        return false;
      } else if (splitted_text.includes("UCI_ShowWDL")) {
        await this.#discard_remaining_stdout_lines("uciok");
        return true;
      }
    }
  }

  /**
   * Searches to the specified depth and evaluates the current position.
   *
   * @param searchtime Time for Stockfish to evaluate in milliseconds
   *
   * @returns "type", and the value will be either "cp" (centipawns) or "mate".
   * "value" will be an int (representing either a cp value or a mate in n value).
   */
  async get_evaluation(searchtime?: number): Promise<{
    type: string | undefined;
    value: number;
  }> {
    if (this._on_weaker_setting()) {
      this.#weaker_setting_warning(
        "get_evaluation will still return full strength Stockfish's evaluation of the position.",
      );
    }

    // If the user wants the evaluation specified relative to who is to move, this will be done.
    // Otherwise, the evaluation will be in terms of white's side (positive meaning advantage white, negative meaning advantage black).
    const compare =
      this.get_turn_perspective() ||
      (await this.get_fen_position()).includes("w")
        ? 1
        : -1;

    if (!searchtime) {
      this.#go();
    } else {
      this.#go_time(searchtime);
    }

    const lines = await this.#get_sf_go_command_output();
    // console.debug({ lines });
    const split_line = lines
      .filter((line) => line.startsWith("info"))
      .at(-1)!
      .split(/\s+/);
    const score_index = split_line.indexOf("score");
    const eval_type = split_line[score_index + 1];
    const val = split_line[score_index + 2];
    return { type: eval_type, value: parseInt(val) * compare };
  }

  /**
   * Sends the 'eval' command to stockfish to get the static evaluation. The current position is 'directly' evaluated -- i.e., no search is involved.
   *
   * @returns A decimal representing the static eval, unless one side is in check or checkmated, in which case `null` is returned.
   */
  async get_static_eval(): Promise<number | null> {
    // Stockfish gives the static eval from white's perspective:
    const compare =
      !this.get_turn_perspective() ||
      (await this.get_fen_position()).includes("w")
        ? 1
        : -1;

    this.#put("eval");

    while (true) {
      const text = await this.#readline();
      if (
        text.includes("Final evaluation") ||
        text.includes("Total evaluation")
      ) {
        const static_eval = text.split(/\s+/)[2];
        if (static_eval === "none") {
          return null;
        } else {
          return parseFloat(static_eval) * compare;
        }
      }
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
   * @returns A list of dictionaries, where each dictionary contains keys for `Move`, `Centipawn`, and `Mate`.\
   *          The corresponding value for either the `Centipawn` or `Mate` key will be `null`.\
   *          If there are no moves in the position, an empty list is returned.
   *
   *          If `verbose` is `true`, the dictionary will also include the following keys: `SelectiveDepth`, `Time`,
   *          `Nodes`, `NodesPerSecond`, `MultiPVLine`, and `WDL` (if available).
   */
  async get_top_moves(
    num_top_moves: number = 5,
    options?: { verbose?: boolean; num_nodes?: number },
  ): Promise<MoveEvaluation[]> {
    const { verbose = false, num_nodes = 0 } = { ...options };

    if (num_top_moves <= 0) {
      throw new Error("num_top_moves must be a positive number.");
    }

    if (this._on_weaker_setting()) {
      this.#weaker_setting_warning(
        "get_top_moves will still return the top moves of full strength Stockfish.",
      );
    }

    // remember global values
    const old_multipv: number = this._parameters.MultiPV;
    const old_num_nodes: number = this._num_nodes;

    // to get number of top moves, we use Stockfish's MultiPV option (i.e., multiple principal variations).
    // set MultiPV to num_top_moves requested

    if (num_top_moves !== this._parameters.MultiPV) {
      this._set_option("MultiPV", num_top_moves);
    }

    // start engine. will go until reaches `this._depth` or `this._num_nodes`
    if (num_nodes === 0) {
      this.#go();
    } else {
      this._num_nodes = num_nodes;
      this.#go_nodes();
    }

    const lines = (await this.#get_sf_go_command_output()).map((line) =>
      line.trim().split(/\s+/),
    );

    // Stockfish is now done evaluating the position, and the output is stored in the 'lines' array

    let top_moves: MoveEvaluation[] = [];

    // Set perspective of evaluations.
    // If get_turn_perspective() is true, or white to move, use Stockfish's values, otherwise invert values.
    const perspective =
      this.get_turn_perspective() ||
      (await this.get_fen_position()).includes("w")
        ? 1
        : -1;

    // loop through Stockfish output lines in reverse order
    for (const line of lines.toReversed()) {
      // If the line is a "bestmove" line, and the best move is "(none)", then
      // there are no top moves, and we are done. Otherwise, continue with the next line.

      if (line[0] === "bestmove") {
        if (line[1] === "(none)") {
          top_moves = [];
          break;
        }
        continue;
      }

      // if the line has no relevant info, we are done
      if (!line.includes("multipv") || !line.includes("depth")) {
        break;
      }

      // if we are searching depth and the line is not our desired depth, we are done
      if (
        num_nodes === 0 &&
        parseInt(this.#pick(line, "depth")) !== this._depth
      ) {
        break;
      }

      // if we are searching nodes and the line has less than desired number of nodes, we are done
      if (
        num_nodes > 0 &&
        parseInt(this.#pick(line, "nodes")) < this._num_nodes
      ) {
        break;
      }

      const move_evaluation: MoveEvaluation = {
        // get move
        Move: this.#pick(line, "pv"),
        // get cp if available
        Centipawn: line.includes("cp")
          ? parseInt(this.#pick(line, "cp")) * perspective
          : null,
        Mate: line.includes("mate")
          ? parseInt(this.#pick(line, "mate")) * perspective
          : null,
      };

      // add more info if verbose
      if (verbose) {
        move_evaluation.Time = this.#pick(line, "time");
        move_evaluation.Nodes = this.#pick(line, "nodes");
        move_evaluation.MultiPVLine = this.#pick(line, "multipv");
        move_evaluation.NodesPerSecond = this.#pick(line, "nps");
        move_evaluation.SelectiveDepth = this.#pick(line, "seldepth");
        move_evaluation.WDL = (
          perspective > 0
            ? [
                this.#pick(line, "wdl", 1),
                this.#pick(line, "wdl", 2),
                this.#pick(line, "wdl", 3),
              ]
            : [
                this.#pick(line, "wdl", 3),
                this.#pick(line, "wdl", 2),
                this.#pick(line, "wdl", 1),
              ]
        ).join(" ");
      }

      // add move to list of top moves
      top_moves.splice(0, 0, move_evaluation);
    }

    // reset MultiPV to global value
    if (old_multipv !== this._parameters.MultiPV) {
      this._set_option("MultiPV", old_multipv);
    }

    // reset `this._num_nodes` to global value
    if (old_num_nodes !== this._num_nodes) {
      this._num_nodes = old_num_nodes;
    }

    return top_moves;
  }

  /**
   * Returns perft information of the current position for a given depth
   *
   * @param depth The search depth given as an integer (1 or higher)
   */
  async get_perft(depth: number): Promise<{
    readonly num_nodes: number;
    readonly move_possibilities: Record<string, number>;
  }> {
    if (depth < 1) {
      throw new TypeError("depth must be an integer higher than 0");
    }

    this.#go_perft(depth);

    const move_possibilities: Record<string, number> = {};
    let num_nodes = 0;
    while (true) {
      const line = await this.#readline();
      if (line.includes("searched")) {
        num_nodes = parseInt(line.split(":")[1]!);
        break;
      }

      console.debug({ line });
      const [move, num] = line.split(":");
      if (Object.keys(move_possibilities).includes(move!)) {
        throw new Error("assert move not in move_possibilities");
      }

      move_possibilities[move!] = parseInt(num!);
    }
    return { num_nodes, move_possibilities } as const;
  }

  /**
   * Flip the side to move
   */
  flip(): void {
    this.#put("flip");
  }

  #pick(line: string[], value: string = "", index: number = 1): string {
    return line[line.indexOf(value) + index]!;
  }

  /**
   * Returns what is on the specified square.
   *
   * @param square The coordinate of the square in question, eg. e4.
   *
   * @returns object if the square is empty.
   */
  async get_what_is_on_square(square: string): Promise<Piece | null> {
    if (square.length !== 2) {
      throw new Error(
        "square argument to the get_what_is_on_square function isn't valid.",
      );
    }

    const file_letter: string = square[0]!.toLowerCase();
    const rank_num: number = parseInt(square[1]!);

    if (
      file_letter < "a" ||
      file_letter > "h" ||
      square[1]! < "1" ||
      square[1]! > "8"
    ) {
      throw new Error(
        "square argument to the get_what_is_on_square function isn't valid.",
      );
    }

    const rank_visual: string = (await this.get_board_visual()).split(/\r?\n/)[
      17 - 2 * rank_num
    ]!;

    const ord = (c: string): number => [...c][0]!.codePointAt(0)!;
    const piece_as_char: string =
      rank_visual[2 + (ord(file_letter) - ord("a")) * 4]!;

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
  async will_move_be_a_capture(move_value: string): Promise<Capture> {
    if (!(await this.is_move_correct(move_value))) {
      throw new Error(
        "The proposed move is not valid in the current position.",
      );
    }

    const starting_square_piece = await this.get_what_is_on_square(
      move_value.slice(0, 2),
    );
    const ending_square_piece = await this.get_what_is_on_square(
      move_value.slice(2, 4),
    );

    if (ending_square_piece !== null) {
      if (!this._parameters.UCI_Chess960) {
        return Capture.DIRECT_CAPTURE;
      }

      // Check for Chess960 castling:
      const castling_pieces = <(Piece | null)[][]>[
        [Piece.WHITE_KING, Piece.WHITE_ROOK],
        [Piece.BLACK_KING, Piece.BLACK_ROOK],
      ];

      if (
        castling_pieces.includes([starting_square_piece, ending_square_piece])
      ) {
        return Capture.NO_CAPTURE;
      }

      return Capture.DIRECT_CAPTURE;
    }

    if (
      move_value.slice(2, 4) ===
        (await this.get_fen_position()).split(/\s+/)[3] &&
      (<(Piece | null)[]>[Piece.WHITE_PAWN, Piece.BLACK_PAWN]).includes(
        starting_square_piece,
      )
    ) {
      return Capture.EN_PASSANT;
    }

    return Capture.NO_CAPTURE;
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

  async #set_stockfish_version(): Promise<void> {
    this.#put("uci");
    // read version text:
    while (true) {
      const line = await this.#readline();
      if (line.startsWith("id name")) {
        await this.#discard_remaining_stdout_lines("uciok");
        this.#parse_stockfish_version(line.split(/\s+/)[3]);
        return;
      }
    }
  }

  #parse_stockfish_version(version_text: string = ""): void {
    try {
      this._version = {
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
        this._version.patch = this._version.text.split("-")[1]!;
        this._version.sha = this._version.text.split("-")[2]!;
        // get major.minor version as text from build date
        const build_date = this._version.text.split("-")[1]!;
        const date_string = `${parseInt(build_date.slice(0, 4))}-${parseInt(
          build_date.slice(4, 6),
        )}-${parseInt(build_date.slice(6, 8))}`;
        this._version.text =
          this._get_stockfish_version_from_build_date(date_string);
      }

      // check if version is a development build, eg. 280322
      if (this._version.text.length === 6) {
        this._version.is_dev_build = true;
        // parse version number from DDMMYY
        this._version.patch = this._version.text;
        // parse build date from dev version text
        const build_date = this._version.text;
        const date_string = `20${build_date.slice(4, 6)}-${build_date.slice(
          2,
          4,
        )}-${build_date.slice(0, 2)}`;
        this._version.text =
          this._get_stockfish_version_from_build_date(date_string);
      }

      // parse version number for all versions
      this._version.major = parseInt(this._version.text.split(".")[0]!);

      try {
        this._version.minor = parseInt(this._version.text.split(".")[1]!);
      } catch {
        this._version.minor = 0;
      }
    } catch (e) {
      throw new Error(
        "Unable to parse Stockfish version. You may be using an unsupported version of Stockfish.",
        { cause: e },
      );
    }
  }

  private _get_stockfish_version_from_build_date(
    date_string: string = "",
  ): string {
    // Convert date string to datetime object
    const date_object = new Date(date_string);
    // Convert release date strings to datetime objects
    const releases_datetime = Object.fromEntries(
      Object.entries(Stockfish._RELEASES).map(([key, value]) => [
        key,
        new Date(value),
      ]),
    );

    // Find the key for the given date
    let key_for_date = null;
    for (const [key, value] of Object.entries(releases_datetime)) {
      if (value <= date_object) {
        if (key_for_date === null || value > releases_datetime[key_for_date]!) {
          key_for_date = key;
        }
      }
    }

    if (key_for_date === null) {
      throw new Error(
        "There was a problem with finding the release associated with the engine publish date.",
      );
    }

    return key_for_date;
  }

  /**
   * Sends the 'quit' command to the Stockfish engine, getting the process to stop.
   */
  async quit_stockfish(): Promise<void> {
    if (this.has_quit) return;
    this.#put("quit");
    await this.#stockfish.exited;
  }

  get has_quit(): boolean {
    return this.#stockfish.exitCode !== null;
  }

  async kill_stockfish(): Promise<void> {
    this.#stockfish.kill();
    await this.#stockfish.exited;
  }
}

interface MoveEvaluation {
  Move: string;
  Centipawn: number | null;
  Mate: number | null;
  Time?: string;
  Nodes?: string;
  MultiPVLine?: string;
  NodesPerSecond?: string;
  SelectiveDepth?: string;
  WDL?: string;
}

export class StockfishError extends Error {
  override readonly name = "StockfishError";
  readonly reason: "crashed" | "readtimeout" | "streamended";

  constructor(
    message: string,
    reason: "crashed" | "readtimeout" | "streamended",
  ) {
    super(message);
    this.reason = reason;
  }
}

class BrokenPipeError extends Error {
  override readonly name = "BrokenPipeError";
  readonly code = "EPIPE";

  constructor(message = "Broken pipe") {
    super(message);
  }
}
