// import subprocess
// from typing import Any
// import copy
// import os
// from dataclasses import dataclass
// from enum import Enum
// import re
// import datetime
// import warnings

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

type StockfishParametersKey = keyof StockfishParameters;

type UCICommand = "uci" | (string & {});

/**
 * Integrates the [Stockfish chess engine](https://stockfishchess.org) with Typescript.
 */
export class Stockfish {
  // Used in tests: will count how many times the del function is called.
  _del_counter = 0;

  readonly _RELEASES = {
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

  readonly _PIECE_CHARS = [
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

  //     // _PARAM_RESTRICTIONS stores the types of each of the params,
  //     // and any applicable min and max values, based off the Stockfish source code:
  //     // https://github.com/official-stockfish/Stockfish/blob/65ece7d985291cc787d6c804a33f1dd82b75736d/src/ucioption.cpp#L58-L82
  //     _PARAM_RESTRICTIONS = {
  //         "Debug Log File": (str, None, None),
  //         "Threads": (int, 1, 1024),
  //         "Hash": (int, 1, 2048),
  //         "Ponder": (bool, None, None),
  //         "MultiPV": (int, 1, 500),
  //         "Skill Level": (int, 0, 20),
  //         "Move Overhead": (int, 0, 5000),
  //         "Slow Mover": (int, 10, 1000),
  //         "UCI_Chess960": (bool, None, None),
  //         "UCI_LimitStrength": (bool, None, None),
  //         "UCI_Elo": (int, 1320, 3190),
  //         "Contempt": (int, -100, 100),
  //         "Min Split Depth": (int, 0, 12),
  //         "Minimum Thinking Time": (int, 0, 5000),
  //         "UCI_ShowWDL": (bool, None, None),
  //     }

  readonly _DEFAULT_STOCKFISH_PARAMS = {
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

  private _debug_view: boolean;
  private _path: string;
  private _has_quit_command_been_sent: boolean;
  private info: string;
  private _parameters: Partial<StockfishParameters>;
  private _stockfish: Bun.Subprocess<"pipe", "pipe", "pipe">;

  private _num_nodes: number;
  private _depth: number;
  private _turn_perspective: boolean;

  /**
   * Initializes the Stockfish engine.
   *
   * @example ```ts
   * import { Stockfish } from "@stockfish/bun";
   * const stockfish = new Stockfish();
   * ```
   */
  constructor(options?: {
    path?: string;
    depth?: number;
    parameters?: Partial<StockfishParameters>;
    num_nodes?: number;
    turn_perspective?: boolean;
    debug_view?: boolean;
  }) {
    const {
      path = "stockfish",
      depth = 15,
      parameters,
      num_nodes = 1000000,
      turn_perspective = true,
      debug_view = false,
    } = { ...options };

    this._debug_view = debug_view;
    this._path = path;
    this._stockfish = Bun.spawn({
      cmd: [this._path],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this._has_quit_command_been_sent = false;
    this._set_stockfish_version();
    this._put("uci");
    this.set_depth(depth);
    this.set_num_nodes(num_nodes);
    this.set_turn_perspective(turn_perspective);
    this.info = "";
    this._parameters = {};
    this.update_engine_parameters(this._DEFAULT_STOCKFISH_PARAMS);
    this.update_engine_parameters(parameters);
    if (this.does_current_engine_version_have_wdl_option()) {
      this._set_option("UCI_ShowWDL", true, false);
    }
    this._prepare_for_new_position(true);
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
   * "Updates the Stockfish engine parameters.
   */
  update_engine_parameters(parameters?: Partial<StockfishParameters>): void {
    if (!parameters) return;

    const new_param_values = structuredClone(parameters);

    //         for key in new_param_values:
    //             if len(this._parameters) > 0 and key not in this._parameters:
    //                 raise ValueError(f"'{key}' is not a key that exists.")
    //             if key in ("Ponder", "UCI_Chess960", "UCI_LimitStrength") and not isinstance(
    //                 new_param_values[key], bool
    //             ):
    //                 raise ValueError(
    //                     f"The value for the '{key}' key has been updated from a string to a bool in a new release of the python stockfish package."
    //                 )
    //             this._validate_param_val(key, new_param_values[key])

    //         if ("Skill Level" in new_param_values) != (
    //             "UCI_Elo" in new_param_values
    //         ) and "UCI_LimitStrength" not in new_param_values:
    //             # This means the user wants to update the Skill Level or UCI_Elo (only one,
    //             # not both), and that they didn't specify a new value for UCI_LimitStrength.
    //             # So, update UCI_LimitStrength, in case it's not the right value currently.
    //             if "Skill Level" in new_param_values:
    //                 new_param_values.update({"UCI_LimitStrength": false})
    //             elif "UCI_Elo" in new_param_values:
    //                 new_param_values.update({"UCI_LimitStrength": true})

    //         if "Threads" in new_param_values:
    //             # Recommended to set the hash param after threads.
    //             threads_value = new_param_values["Threads"]
    //             del new_param_values["Threads"]
    //             hash_value = None
    //             if "Hash" in new_param_values:
    //                 hash_value = new_param_values["Hash"]
    //                 del new_param_values["Hash"]
    //             else:
    //                 hash_value = this._parameters["Hash"]
    //             new_param_values["Threads"] = threads_value
    //             new_param_values["Hash"] = hash_value

    //         for name, value in new_param_values.items():
    //             this._set_option(name, value)
    //         this.set_fen_position(this.get_fen_position(), false)
    //         # Getting SF to set the position again, since UCI option(s) have been updated.
  }

  /**
   * Resets the Stockfish engine parameters.
   */
  reset_engine_parameters(): void {
    this.update_engine_parameters(this._DEFAULT_STOCKFISH_PARAMS);
  }

  _prepare_for_new_position(send_ucinewgame_token: boolean = true): void {
    if (send_ucinewgame_token) {
      this._put("ucinewgame");
    }
    this._is_ready();
    this.info = "";
  }

  _put(command: UCICommand): void {
    if (!this._stockfish.stdin) {
      throw new BrokenPipeError();
    }

    if (this._stockfish.exitCode !== null) {
      return;
    }

    if (!this._has_quit_command_been_sent) {
      if (this._debug_view) console.debug(`>>> ${command}\n`);
      this._stockfish.stdin.write(`${command}\n`);
      this._stockfish.stdin.flush();
      if (command === "quit") {
        this._has_quit_command_been_sent = true;
      }
    }
  }

  _read_line(): string {
    if (!this._stockfish.stdout) {
      throw new BrokenPipeError();
    }
    if (this._stockfish.exitCode !== null) {
      throw new StockfishError("The Stockfish process has crashed");
    }
    //   const line = this._stockfish.stdout.readline().strip();
    //   return line
  }

  /**
   * Calls `_read_line()` until encountering `substr_in_last_line` in the line.
   */
  _discard_remaining_stdout_lines(substr_in_last_line: string): void {
    while (!this._read_line().includes(substr_in_last_line));
  }

  //      _set_option(name: string, value: Any, update_parameters_attribute: boolean = true): void
  //         this._validate_param_val(name, value)
  //         str_rep_value = str(value)
  //         if isinstance(value, bool):
  //             str_rep_value = str_rep_value.lower()
  //         this._put(f"setoption name {name} value {str_rep_value}")
  //         if update_parameters_attribute:
  //             this._parameters.update({name: value})
  //         this._is_ready()

  //      _validate_param_val(name: string, value: Any): void
  //         if name not in Stockfish._PARAM_RESTRICTIONS:
  //             raise ValueError(f"{name} is not a supported engine parameter")
  //         required_type, minimum, maximum = Stockfish._PARAM_RESTRICTIONS[name]
  //         if type(value) is not required_type:
  //             raise ValueError(f"{value} is not of type {required_type}")
  //         if minimum is not None and type(value) is int and value < minimum:
  //             raise ValueError(f"{value} is below {name}'s minimum value of {minimum}")
  //         if maximum is not None and type(value) is int and value > maximum:
  //             raise ValueError(f"{value} is over {name}'s maximum value of {maximum}")

  _is_ready(): void {
    this._put("isready");
    while (this._read_line() != "readyok");
  }

  _go(): void {
    this._put(`go depth ${this._depth}`);
  }

  _go_nodes(): void {
    this._put(`go nodes ${this._num_nodes}`);
  }

  _go_time(time: number): void {
    this._put(`go movetime ${time}`);
  }

  _go_remaining_time(wtime?: number, btime?: number): void {
    let cmd = "go";
    if (wtime !== undefined) {
      cmd += ` wtime ${wtime}`;
    }
    if (btime !== undefined) {
      cmd += ` btime ${btime}`;
    }
    this._put(cmd);
  }

  //      _go_perft(depth: number): void
  //         this._put(f"go perft {depth}")

  //      _on_weaker_setting():boolean
  //         return this._parameters["UCI_LimitStrength"] or this._parameters["Skill Level"] < 20

  //      _weaker_setting_warning(message: string): void
  //         """Will issue a warning, referring to the function that calls this one."""
  //         warnings.warn(message, stacklevel=3)

  //      set_fen_position(fen_position: string, send_ucinewgame_token: boolean = true): void
  //         """Sets current board position in Forsyth-Edwards notation (FEN).

  //         Args:
  //             fen_position:
  //               FEN string of board position.

  //             send_ucinewgame_token:
  //               Whether to send the `ucinewgame` token to the Stockfish engine.
  //               The most prominent effect this will have is clearing Stockfish's transposition table,
  //               which should be done if the new position is unrelated to the current position.

  //         Returns:
  //             `None`

  //         Example:
  //             >>> stockfish.set_fen_position("1nb1k1n1/pppppppp/8/6r1/5bqK/6r1/8/8 w - - 2 2")
  //         """
  //         this._prepare_for_new_position(send_ucinewgame_token)
  //         this._put(f"position fen {fen_position}")

  //      set_position(moves: string[] | None = None): void
  //         """Sets current board position.

  //         Args:
  //             moves:
  //               A list of moves to set this position on the board.
  //               Must be in full algebraic notation.

  //         Returns:
  //             `None`

  //         Example:
  //             >>> stockfish.set_position(['e2e4', 'e7e5'])
  //         """
  //         this.set_fen_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", true)
  //         this.make_moves_from_current_position(moves)

  //      make_moves_from_current_position(moves: string[] | None): void
  //         """Sets a new position by playing the moves from the current position.

  //         Args:
  //             moves:
  //               A list of moves to play in the current position, in order to reach a new position.
  //               Must be in full algebraic notation.

  //         Returns:
  //             `None`

  //         Example:
  //             >>> stockfish.make_moves_from_current_position(["g4d7", "a8b8", "f1d1"])
  //         """
  //         if not moves:
  //             return
  //         this._prepare_for_new_position(false)
  //         for move in moves:
  //             if not this.is_move_correct(move):
  //                 raise ValueError(f"Cannot make move: {move}")
  //             this._put(f"position fen {this.get_fen_position()} moves {move}")

  //      get_board_visual(perspective_white: boolean = true): string
  //         """Returns a visual representation of the current board position.

  //         Args:
  //             perspective_white:
  //               A boolean that indicates whether the board should be displayed from the
  //               perspective of white. `true` indicates White's perspective.

  //         Returns:
  //             String of visual representation of the chessboard with its pieces in current position.

  //             For example:
  //             ```
  //             +---+---+---+---+---+---+---+---+
  //             | r | n | b | q | k | b | n | r | 8
  //             +---+---+---+---+---+---+---+---+
  //             | p | p | p | p | p | p | p | p | 7
  //             +---+---+---+---+---+---+---+---+
  //             |   |   |   |   |   |   |   |   | 6
  //             +---+---+---+---+---+---+---+---+
  //             |   |   |   |   |   |   |   |   | 5
  //             +---+---+---+---+---+---+---+---+
  //             |   |   |   |   |   |   |   |   | 4
  //             +---+---+---+---+---+---+---+---+
  //             |   |   |   |   |   |   |   |   | 3
  //             +---+---+---+---+---+---+---+---+
  //             | P | P | P | P | P | P | P | P | 2
  //             +---+---+---+---+---+---+---+---+
  //             | R | N | B | Q | K | B | N | R | 1
  //             +---+---+---+---+---+---+---+---+
  //               a   b   c   d   e   f   g   h
  //             ```
  //         """
  //         this._put("d")
  //         board_rep_lines: string[] = []
  //         count_lines: number = 0
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
  //         if not perspective_white:
  //             board_rep_lines = board_rep_lines[::-1]
  //         board_str = this._read_line()
  //         if "a   b   c" in board_str:
  //             # Engine being used is recent enough to have coordinates, so add them:
  //             if perspective_white:
  //                 board_rep_lines.append(f"  {board_str}")
  //             else:
  //                 board_rep_lines.append(f"  {board_str[::-1]}")
  //         this._discard_remaining_stdout_lines("Checkers")
  //         # "Checkers" is in the last line outputted by Stockfish for the "d" command.
  //         board_rep = "\n".join(board_rep_lines) + "\n"
  //         return board_rep

  //      get_fen_position(this): string
  //         """Returns current board position in Forsyth-Edwards notation (FEN).

  //         Returns:
  //             String of current board position in Forsyth-Edwards notation (FEN).

  //             For example: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
  //         """
  //         this._put("d")
  //         while true:
  //             text = this._read_line()
  //             splitted_text = text.split(" ")
  //             if splitted_text[0] == "Fen:":
  //                 this._discard_remaining_stdout_lines("Checkers")
  //                 return " ".join(splitted_text[1:])

  //      set_skill_level(skill_level: number = 20): void
  //         """Sets current skill level of stockfish engine.

  //         Args:
  //             skill_level:
  //               Skill Level option between 0 (weakest level) and 20 (full strength)

  //         Returns:
  //             `None`

  //         Example:
  //             >>> stockfish.set_skill_level(10)
  //         """
  //         this.update_engine_parameters({"UCI_LimitStrength": false, "Skill Level": skill_level})

  //      set_elo_rating(elo_rating: number = 1350): void
  //         """Sets current Elo rating of Stockfish engine, ignoring skill level.

  //         Args:
  //             elo_rating: Aim for an engine strength of the given Elo

  //         Returns:
  //             `None`

  //         Example:
  //             >>> stockfish.set_elo_rating(2500)
  //         """
  //         this.update_engine_parameters({"UCI_LimitStrength": true, "UCI_Elo": elo_rating})

  //      resume_full_strength(this): void
  //         """Puts Stockfish back to full strength, if you've previously lowered the elo or skill level.

  //         Returns:
  //             `None`

  //         Example:
  //             >>> stockfish.reset_to_full_strength()
  //         """
  //         this.update_engine_parameters({"UCI_LimitStrength": false, "Skill Level": 20})

  /**
   * Sets current depth of Stockfish engine.
   */
  set_depth(depth: number = 15): void {
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
  set_num_nodes(num_nodes: number = 1000000): void {
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
   * @returns A string of move in algebraic notation, or `None` if it's a mate now.
   */
  get_best_move(wtime?: number, btime?: number) {
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
   * @returns A string of move in algebraic notation, or `None` if it's a mate now.
   */
  get_best_move_time(time: number = 1000) {
    this._go_time(time);
    return this._get_best_move_from_sf_popen_process();
  }

  /**
   * Precondition - a "go" command must have been sent to SF before calling this function.
   * This function needs existing output to read from the SF popen process.
   */
  _get_best_move_from_sf_popen_process() {
    const lines: string[] = this._get_sf_go_command_output();
    this.info = lines[-2];
    const last_line_split = lines.at(-1).split(" ");
    //         return None if last_line_split[1] == "(none)" else last_line_split[1]
  }

  /**
   * Precondition - a "go" command must have been sent to SF before calling this function.
   * This function needs existing output to read from the SF popen process.
   *
   * A list of strings is returned, where each string represents a line of output.
   */
  _get_sf_go_command_output(): string[] {
    const lines: string[] = [];
    while (true) {
      lines.push(this._read_line());
      // if lines[-1].startswith("bestmove"):
      //     // The "bestmove" line is the last line of the output.
      //     return lines
    }
  }

  //     @staticmethod
  //      _is_fen_syntax_valid(fen: string) -> bool:
  //         # Code for this function taken from: https://gist.github.com/Dani4kor/e1e8b439115878f8c6dcf127a4ed5d3e
  //         # Some small changes have been made to the code.
  //         if not re.match(
  //             r"\s*^(((?:[rnbqkpRNBQKP1-8]+\/){7})[rnbqkpRNBQKP1-8]+)\s([b|w])\s(-|[K|Q|k|q]{1,4})\s(-|[a-h][1-8])\s(\d+\s\d+)$",
  //             fen,
  //         ):
  //             return false

  //         fen_fields = fen.split()

  //         if any(
  //             (
  //                 len(fen_fields) != 6,
  //                 len(fen_fields[0].split("/")) != 8,
  //                 any(x not in fen_fields[0] for x in "Kk"),
  //                 any(not fen_fields[x].isdigit() for x in (4, 5)),
  //                 int(fen_fields[4]) >= int(fen_fields[5]) * 2,
  //             )
  //         ):
  //             return false

  //         for fenPart in fen_fields[0].split("/"):
  //             field_sum: number = 0
  //             previous_was_digit: boolean = false
  //             for c in fenPart:
  //                 if "1" <= c <= "8":
  //                     if previous_was_digit:
  //                         return false  # Two digits next to each other.
  //                     field_sum += int(c)
  //                     previous_was_digit = true
  //                 elif c in Stockfish._PIECE_CHARS:
  //                     field_sum += 1
  //                     previous_was_digit = false
  //                 else:
  //                     return false  # Invalid character.
  //             if field_sum != 8:
  //                 return false  # One of the rows doesn't have 8 columns.
  //         return true

  //      is_fen_valid(fen: string) -> bool:
  //         """Checks if FEN string is valid.

  //         Returns:
  //             `Boolean`

  //         Example:
  //             >>> is_valid = stockfish.is_fen_valid("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
  //         """
  //         if not Stockfish._is_fen_syntax_valid(fen):
  //             return false
  //         temp_sf: Stockfish = Stockfish(path=this._path, parameters={"Hash": 1})
  //         # Using a new temporary SF instance, in case the fen is an illegal position that causes
  //         # the SF process to crash.
  //         best_move: string | None = None
  //         temp_sf.set_fen_position(fen, false)
  //         try:
  //             temp_sf._put("go depth 10")
  //             best_move = temp_sf._get_best_move_from_sf_popen_process()
  //         except StockfishException:
  //             # If a StockfishException is thrown, then it happened in read_line() since the SF process crashed.
  //             # This is likely due to the position being illegal, so set the var to false:
  //             return false
  //         else:
  //             return best_move is not None
  //         finally:
  //             temp_sf.__del__()
  //             # Calling this function before returning from either the except or else block above.
  //             # The __del__ function should generally be called implicitly by python when this
  //             # temp_sf object goes out of scope, but calling it explicitly guarantees this will happen.

  //      is_move_correct(move_value: string) -> bool:
  //         """Checks new move.

  //         Args:
  //             move_value:
  //               New move value in algebraic notation.

  //         Returns:
  //             `true` if new move is correct, otherwise `false`.

  //         Example:
  //             >>> is_correct = stockfish.is_move_correct("f4f5")
  //         """
  //         old_self_info = this.info
  //         this._put(f"go depth 1 searchmoves {move_value}")
  //         is_move_correct = this._get_best_move_from_sf_popen_process() is not None
  //         this.info = old_self_info
  //         return is_move_correct

  //      get_wdl_stats(get_as_tuple: boolean = false) -> list[int] | tuple[int, int, int] | None:
  //         """Returns Stockfish's win/draw/loss stats for the side to move.

  //         Args:
  //             get_as_tuple:
  //                 Option to return the wdl stats as a tuple instead of a list
  //                 `Boolean`. Default is `false`.

  //         Returns:
  //             A list or tuple of three integers, unless the game is over (in which case
  //             `None` is returned).
  //         """

  //         if not this.does_current_engine_version_have_wdl_option():
  //             raise RuntimeError(
  //                 "Your version of Stockfish isn't recent enough to have the UCI_ShowWDL option."
  //             )
  //         if this._on_weaker_setting():
  //             this._weaker_setting_warning(
  //                 """Note that even though you've set Stockfish to play on a weaker elo or skill level,"""
  //                 + """ get_wdl_stats will still return full strength Stockfish's wdl stats of the position."""
  //             )

  //         this._go()
  //         lines = this._get_sf_go_command_output()
  //         if lines[-1].startswith("bestmove (none)"):
  //             return None
  //         split_line = [line.split(" ") for line in lines if " multipv 1 " in line][-1]
  //         wdl_index = split_line.index("wdl")

  //         wdl_stats = [int(split_line[i]) for i in range(wdl_index + 1, wdl_index + 4)]

  //         if get_as_tuple:
  //             return (wdl_stats[0], wdl_stats[1], wdl_stats[2])
  //         return wdl_stats

  /**
   * Returns whether the user's version of Stockfish has the option to display WDL stats.
   * @returns `true` if Stockfish has the `WDL` option, otherwise `false`.
   */
  does_current_engine_version_have_wdl_option(): boolean {
    this._put("uci");
    while (true) {
      const splitted_text = this._read_line().split(" ");
      if (splitted_text[0] == "uciok") {
        return false;
      } else if (splitted_text.includes("UCI_ShowWDL")) {
        this._discard_remaining_stdout_lines("uciok");
        return true;
      }
    }
  }

  //      get_evaluation(searchtime: number | None = None) -> dict[str, str | int]:
  //         """Searches to the specified depth and evaluates the current position.

  //         Args:
  //             searchtime:
  //               [Optional] Time for Stockfish to evaluate in milliseconds (int)

  //         Returns:
  //             A dictionary of two pairs: {str: string, str: number}
  //             - The first pair describes the type of the evaluation. The key is "type", and the value
  //               will be either "cp" (centipawns) or "mate".
  //             - The second pair describes the value of the evaluation. The key is "value", and the value
  //               will be an int (representing either a cp value or a mate in n value).
  //         """

  //         if this._on_weaker_setting():
  //             this._weaker_setting_warning(
  //                 """Note that even though you've set Stockfish to play on a weaker elo or skill level,"""
  //                 + """ get_evaluation will still return full strength Stockfish's evaluation of the position."""
  //             )
  //         compare: number = 1 if this.get_turn_perspective() or ("w" in this.get_fen_position()) else -1
  //         # If the user wants the evaluation specified relative to who is to move, this will be done.
  //         # Otherwise, the evaluation will be in terms of white's side (positive meaning advantage white,
  //         # negative meaning advantage black).
  //         if searchtime is None:
  //             this._go()
  //         else:
  //             this._go_time(searchtime)
  //         lines = this._get_sf_go_command_output()
  //         split_line = [line.split(" ") for line in lines if line.startswith("info")][-1]
  //         score_index = split_line.index("score")
  //         eval_type, val = split_line[score_index + 1], split_line[score_index + 2]
  //         return {"type": eval_type, "value": number(val) * compare}

  //      get_static_eval(this) -> float | None:
  //         """Sends the 'eval' command to stockfish to get the static evaluation. The current position is
  //            'directly' evaluated -- i.e., no search is involved.

  //         Returns:
  //             A float representing the static eval, unless one side is in check or checkmated,
  //             in which case None is returned.
  //         """

  //         # Stockfish gives the static eval from white's perspective:
  //         compare: number = (
  //             1 if not this.get_turn_perspective() or ("w" in this.get_fen_position()) else -1
  //         )
  //         this._put("eval")
  //         while true:
  //             text = this._read_line()
  //             if any(text.startswith(x) for x in ("Final evaluation", "Total Evaluation")):
  //                 static_eval = text.split()[2]
  //                 if " none " not in text:
  //                     this._read_line()
  //                     # Consume the remaining line (for some reason `eval` outputs an extra newline)
  //                 if static_eval == "none":
  //                     assert "(in check)" in text
  //                     return None
  //                 else:
  //                     return float(static_eval) * compare

  //      get_top_moves(
  //         num_top_moves: number = 5, verbose: boolean = false, num_nodes: number = 0
  //     ) -> list[dict[str, Any]]:
  //         """Returns info on the top moves in the position.

  //         Args:
  //             num_top_moves:
  //               The number of moves for which to return information, assuming there
  //               are at least that many legal moves.
  //               Default is 5.

  //             verbose:
  //               Option to include the full info from the engine in the returned dictionary,
  //               including seldepth, multipv, time, nodes, nps, and wdl if available.
  //               `Boolean`. Default is `false`.

  //             num_nodes:
  //               Option to search until a certain number of nodes have been searched, instead of depth.
  //               Default is 0.

  //         Returns:
  //             A list of dictionaries, where each dictionary contains keys for `Move`, `Centipawn`, and `Mate`.
  //             The corresponding value for either the `Centipawn` or `Mate` key will be `None`.
  //             If there are no moves in the position, an empty list is returned.

  //             If `verbose` is `true`, the dictionary will also include the following keys: `SelectiveDepth`, `Time`,
  //             `Nodes`, `NodesPerSecond`, `MultiPVLine`, and `WDL` (if available).

  //         Example:
  //             >>> moves = stockfish.get_top_moves(2, num_nodes=1000000, verbose=true)
  //         """
  //         if num_top_moves <= 0:
  //             raise ValueError("num_top_moves is not a positive number.")
  //         if this._on_weaker_setting():
  //             this._weaker_setting_warning(
  //                 """Note that even though you've set Stockfish to play on a weaker elo or skill level,"""
  //                 + """ get_top_moves will still return the top moves of full strength Stockfish."""
  //             )

  //         # remember global values
  //         old_multipv: number = this._parameters["MultiPV"]
  //         old_num_nodes: number = this._num_nodes

  //         # to get number of top moves, we use Stockfish's MultiPV option (i.e., multiple principal variations).
  //         # set MultiPV to num_top_moves requested
  //         if num_top_moves != this._parameters["MultiPV"]:
  //             this._set_option("MultiPV", num_top_moves)

  //         # start engine. will go until reaches this._depth or this._num_nodes
  //         if num_nodes == 0:
  //             this._go()
  //         else:
  //             this._num_nodes = num_nodes
  //             this._go_nodes()

  //         lines: list[string[]] = [line.split(" ") for line in this._get_sf_go_command_output()]

  //         # Stockfish is now done evaluating the position,
  //         # and the output is stored in the list 'lines'
  //         top_moves: list[dict[str, str | int | None]] = []

  //         # Set perspective of evaluations. If get_turn_perspective() is true, or white to move,
  //         # use Stockfish's values -- otherwise, invert values.
  //         perspective: number = (
  //             1 if this.get_turn_perspective() or ("w" in this.get_fen_position()) else -1
  //         )

  //         # loop through Stockfish output lines in reverse order
  //         for line in reversed(lines):
  //             # If the line is a "bestmove" line, and the best move is "(none)", then
  //             # there are no top moves, and we're done. Otherwise, continue with the next line.
  //             if line[0] == "bestmove":
  //                 if line[1] == "(none)":
  //                     top_moves = []
  //                     break
  //                 continue

  //             # if the line has no relevant info, we're done
  //             if ("multipv" not in line) or ("depth" not in line):
  //                 break

  //             # if we're searching depth and the line is not our desired depth, we're done
  //             if (num_nodes == 0) and (int(this._pick(line, "depth")) != this._depth):
  //                 break

  //             # if we're searching nodes and the line has less than desired number of nodes, we're done
  //             if (num_nodes > 0) and (int(this._pick(line, "nodes")) < this._num_nodes):
  //                 break

  //             move_evaluation: dict[str, str | int | None] = {
  //                 # get move
  //                 "Move": this._pick(line, "pv"),
  //                 # get cp if available
  //                 "Centipawn": (int(this._pick(line, "cp")) * perspective if "cp" in line else None),
  //                 # get mate if available
  //                 "Mate": (int(this._pick(line, "mate")) * perspective if "mate" in line else None),
  //             }

  //             # add more info if verbose
  //             if verbose:
  //                 move_evaluation["Time"] = this._pick(line, "time")
  //                 move_evaluation["Nodes"] = this._pick(line, "nodes")
  //                 move_evaluation["MultiPVLine"] = this._pick(line, "multipv")
  //                 move_evaluation["NodesPerSecond"] = this._pick(line, "nps")
  //                 move_evaluation["SelectiveDepth"] = this._pick(line, "seldepth")

  //                 # add wdl if available
  //                 if this.does_current_engine_version_have_wdl_option():
  //                     move_evaluation["WDL"] = " ".join(
  //                         [
  //                             this._pick(line, "wdl", 1),
  //                             this._pick(line, "wdl", 2),
  //                             this._pick(line, "wdl", 3),
  //                         ][::perspective]
  //                     )

  //             # add move to list of top moves
  //             top_moves.insert(0, move_evaluation)

  //         # reset MultiPV to global value
  //         if old_multipv != this._parameters["MultiPV"]:
  //             this._set_option("MultiPV", old_multipv)

  //         # reset this._num_nodes to global value
  //         if old_num_nodes != this._num_nodes:
  //             this._num_nodes = old_num_nodes

  //         return top_moves

  //      get_perft(depth: number) -> tuple[int, dict[str, int]]:
  //         """Returns perft information of the current position for a given depth

  //         Args:
  //             depth: The search depth given as an integer (1 or higher)

  //         Returns:
  //             A 2-tuple where:
  //                 - The first element is the total number of leaf nodes at the specified depth.
  //                 - The second element is a dictionary. Each legal move in the current position are keys,
  //                   and their associated values are the number of leaf nodes (at the specified depth) for that move.

  //         Example:
  //             >>> num_nodes, move_possibilities = stockfish.get_perft(3)
  //         """
  //         if not isinstance(depth, int) or depth < 1 or isinstance(depth, bool):
  //             raise TypeError("depth must be an integer higher than 0")

  //         this._go_perft(depth)

  //         move_possibilities: dict[str, int] = {}
  //         num_nodes = 0

  //         while true:
  //             line = this._read_line()
  //             if line == "":
  //                 continue
  //             if "searched" in line:
  //                 num_nodes = int(line.split(":")[1])
  //                 break
  //             move, num = line.split(":")
  //             assert move not in move_possibilities
  //             move_possibilities[move] = int(num)
  //         this._read_line()  # Consumes the remaining newline stockfish outputs.

  //         return num_nodes, move_possibilities

  /**
   * Flip the side to move
   */
  flip(): void {
    this._put("flip");
  }

  _pick(line: string[], value: string = "", index: number = 1): string {
    return line[line.indexOf(value) + index];
  }

  //         """Returns what is on the specified square.

  //         Args:
  //             square:
  //                 The coordinate of the square in question, eg. e4.

  //         Returns:
  //             Either one of the 12 enum members in the `Piece` enum, or the `None`
  //             object if the square is empty.

  //         Example:
  //             >>> piece = stockfish.get_what_is_on_square("e2")
  //         """
  //      get_what_is_on_square(square: string) -> "Stockfish.Piece | None":

  //         file_letter: string = square[0].lower()
  //         rank_num: number = int(square[1])
  //         if (
  //             len(square) != 2
  //             or file_letter < "a"
  //             or file_letter > "h"
  //             or square[1] < "1"
  //             or square[1] > "8"
  //         ):
  //             raise ValueError("square argument to the get_what_is_on_square function isn't valid.")
  //         rank_visual: string = this.get_board_visual().splitlines()[17 - 2 * rank_num]
  //         piece_as_char: string = rank_visual[2 + (ord(file_letter) - ord("a")) * 4]
  //         return None if piece_as_char == " " else Stockfish.Piece(piece_as_char)

  //      will_move_be_a_capture(move_value: string) -> "Stockfish.Capture":
  //         """Returns whether the proposed move will be a direct capture,
  //            en passant, or not a capture at all.

  //         Args:
  //             move_value:
  //                 The proposed move, in the notation that Stockfish uses.
  //                 E.g., "e2e4", "g1f3", etc.

  //         Returns:
  //             One of the following members of the `Capture` enum:
  //             - DIRECT_CAPTURE if the move will be a direct capture.
  //             - EN_PASSANT if the move is a capture done with en passant.
  //             - NO_CAPTURE if the move does not capture anything.

  //         Example:
  //             >>> capture = stockfish.will_move_be_a_capture("e2e4")
  //         """
  //         if not this.is_move_correct(move_value):
  //             raise ValueError("The proposed move is not valid in the current position.")
  //         starting_square_piece: Stockfish.Piece | None = this.get_what_is_on_square(move_value[:2])
  //         ending_square_piece: Stockfish.Piece | None = this.get_what_is_on_square(move_value[2:4])
  //         if ending_square_piece is not None:
  //             if not this._parameters["UCI_Chess960"]:
  //                 return Stockfish.Capture.DIRECT_CAPTURE
  //             else:
  //                 # Check for Chess960 castling:
  //                 castling_pieces = [
  //                     [Stockfish.Piece.WHITE_KING, Stockfish.Piece.WHITE_ROOK],
  //                     [Stockfish.Piece.BLACK_KING, Stockfish.Piece.BLACK_ROOK],
  //                 ]
  //                 if [starting_square_piece, ending_square_piece] in castling_pieces:
  //                     return Stockfish.Capture.NO_CAPTURE
  //                 else:
  //                     return Stockfish.Capture.DIRECT_CAPTURE
  //         elif move_value[2:4] == this.get_fen_position().split()[3] and starting_square_piece in [
  //             Stockfish.Piece.WHITE_PAWN,
  //             Stockfish.Piece.BLACK_PAWN,
  //         ]:
  //             return Stockfish.Capture.EN_PASSANT
  //         else:
  //             return Stockfish.Capture.NO_CAPTURE

  //      get_stockfish_full_version(this) -> float:
  //         """Returns Stockfish engine full version."""
  //         return this._version["full"]

  //      get_stockfish_major_version(this) -> int:
  //         """Returns Stockfish engine major version."""
  //         return this._version["major"]

  //      get_stockfish_minor_version(this) -> int:
  //         """Returns Stockfish engine minor version."""
  //         return this._version["minor"]

  //      get_stockfish_patch_version(this): string
  //         """Returns Stockfish engine patch version."""
  //         return this._version["patch"]

  //      get_stockfish_sha_version(this): string
  //         """Returns Stockfish engine build version."""
  //         return this._version["sha"]

  //      is_development_build_of_engine():boolean
  //         """Returns whether the version of Stockfish being used is a
  //            development build.

  //         Returns:
  //              `true` if the version of Stockfish being used is a development build, `false` otherwise.

  //         """
  //         return this._version["is_dev_build"]

  _set_stockfish_version(): void {
    this._put("uci");
    // read version text:
    while (true) {
      const line = this._read_line();
      if (line.startsWith("id name")) {
        this._discard_remaining_stdout_lines("uciok");
        this._parse_stockfish_version(line.split(" ")[3]);
        return;
      }
    }
  }

  _parse_stockfish_version(version_text: string = ""): void {
    //         try:
    //             this._version: dict[str, Any] = {
    //                 "full": 0,
    //                 "major": 0,
    //                 "minor": 0,
    //                 "patch": "",
    //                 "sha": "",
    //                 "is_dev_build": false,
    //                 "text": version_text,
    //             }
    //             # check if version is a development build, eg. dev-20221219-61ea1534
    //             if this._version["text"].startswith("dev-"):
    //                 this._version["is_dev_build"] = true
    //                 # parse patch and sha from dev version text
    //                 this._version["patch"] = this._version["text"].split("-")[1]
    //                 this._version["sha"] = this._version["text"].split("-")[2]
    //                 # get major.minor version as text from build date
    //                 build_date = this._version["text"].split("-")[1]
    //                 date_string = (
    //                     f"{int(build_date[:4])}-{int(build_date[4:6]):02d}-{int(build_date[6:8]):02d}"
    //                 )
    //                 this._version["text"] = this._get_stockfish_version_from_build_date(date_string)
    //             # check if version is a development build, eg. 280322
    //             if len(this._version["text"]) == 6:
    //                 this._version["is_dev_build"] = true
    //                 # parse version number from DDMMYY
    //                 this._version["patch"] = this._version["text"]
    //                 # parse build date from dev version text
    //                 build_date = this._version["text"]
    //                 date_string = f"20{build_date[4:6]}-{build_date[2:4]}-{build_date[0:2]}"
    //                 this._version["text"] = this._get_stockfish_version_from_build_date(date_string)
    //             # parse version number for all versions
    //             this._version["major"] = int(this._version["text"].split(".")[0])
    //             try:
    //                 this._version["minor"] = int(this._version["text"].split(".")[1])
    //             except IndexError:
    //                 this._version["minor"] = 0
    //             this._version["full"] = this._version["major"] + this._version["minor"] / 10
    //         except Exception as e:
    //             raise Exception(
    //                 "Unable to parse Stockfish version. You may be using an unsupported version of Stockfish."
    //             ) from e
  }

  //      _get_stockfish_version_from_build_date(date_string: string = "") -> str | None:
  //         # Convert date string to datetime object
  //         date_object = datetime.datetime.strptime(date_string, "%Y-%m-%d")

  //         # Convert release date strings to datetime objects
  //         releases_datetime = {
  //             key: datetime.datetime.strptime(value, "%Y-%m-%d")
  //             for key, value in this._RELEASES.items()
  //         }

  //         # Find the key for the given date
  //         key_for_date = None
  //         for key, value in releases_datetime.items():
  //             if value <= date_object:
  //                 if key_for_date is None or value > releases_datetime[key_for_date]:
  //                     key_for_date = key

  //         if key_for_date is None:
  //             raise Exception(
  //                 "There was a problem with finding the release associated with the engine publish date."
  //             )

  //         return key_for_date

  //      send_quit_command(this): void
  //         """Sends the 'quit' command to the Stockfish engine, getting the process
  //         to stop."""

  //         if this._stockfish.poll() is None:
  //             this._put("quit")
  //             while this._stockfish.poll() is None:
  //                 pass

  //      __del__(this): void
  //         Stockfish._del_counter += 1
  //         this.send_quit_command()

  //     class Piece(Enum):
  //         WHITE_PAWN = "P"
  //         BLACK_PAWN = "p"
  //         WHITE_KNIGHT = "N"
  //         BLACK_KNIGHT = "n"
  //         WHITE_BISHOP = "B"
  //         BLACK_BISHOP = "b"
  //         WHITE_ROOK = "R"
  //         BLACK_ROOK = "r"
  //         WHITE_QUEEN = "Q"
  //         BLACK_QUEEN = "q"
  //         WHITE_KING = "K"
  //         BLACK_KING = "k"

  //     class Capture(Enum):
  //         DIRECT_CAPTURE = "direct capture"
  //         EN_PASSANT = "en passant"
  //         NO_CAPTURE = "no capture"

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

  //      benchmark(params: BenchmarkParameters): string
  //         """Benchmark will run the bench command with BenchmarkParameters.
  //         It is an Additional custom non-UCI command, mainly for debugging.
  //         Do not use this command during a search!
  //         """
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
