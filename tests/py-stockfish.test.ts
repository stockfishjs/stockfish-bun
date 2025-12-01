import { describe, it, expect } from "bun:test";

// from timeit import default_timer
// import time

import { Stockfish, Capture, Piece, StockfishError } from "~/py-stockfish";

const getDefaultStockfish = () =>
  Stockfish.start({ path: process.env.STOCKFISH_PATH });

describe("Stockfish", () => {
  it("constructor defaults", async () => {
    const stockfish = await getDefaultStockfish();
    expect(stockfish).toBeDefined();
    expect(stockfish).toBeInstanceOf(Stockfish);
    expect(stockfish.get_engine_parameters()).toEqual(
      Stockfish.DEFAULT_STOCKFISH_PARAMS
    );
    expect(stockfish.get_depth()).toBe(15);
    expect(stockfish.get_num_nodes()).toBe(1000000);
    expect(stockfish.get_turn_perspective()).toBeTrue();
  });

  it("constructor options", async () => {
    const stockfish = await Stockfish.start({
      path: process.env.STOCKFISH_PATH,
      depth: 20,
      num_nodes: 1000,
      turn_perspective: false,
      parameters: { Threads: 2, UCI_Elo: 1500 },
    });
    expect(stockfish.get_depth()).toBe(20);
    expect(stockfish.get_num_nodes()).toBe(1000);
    expect(stockfish.get_turn_perspective()).toBeFalse();
    expect(stockfish.get_engine_parameters().Threads).toBe(2);
    expect(stockfish.get_engine_parameters().UCI_Elo).toBe(1500);
  });

  it("get best move first move", async () => {
    const stockfish = await getDefaultStockfish();
    const best_move = await stockfish.get_best_move();
    expect(best_move).toBeOneOf(["e2e3", "e2e4", "g1f3", "b1c3", "d2d4"]);
  });

  it("get best move time first move", async () => {
    const stockfish = await getDefaultStockfish();
    const best_move = await stockfish.get_best_move_time(1000);
    expect(best_move).toBeOneOf(["e2e3", "e2e4", "g1f3", "b1c3", "d2d4"]);
  });

  it("get best move remaining time first move", async () => {
    const stockfish = await getDefaultStockfish();
    let best_move = await stockfish.get_best_move({ wtime: 1000 });
    expect(best_move).toBeOneOf(["a2a3", "d2d4", "e2e4", "g1f3", "c2c4"]);
    best_move = await stockfish.get_best_move({ btime: 1000 });
    expect(best_move).toBeOneOf(["g1f3", "d2d4", "e2e4", "c2c4"]);
    best_move = await stockfish.get_best_move({ wtime: 1000, btime: 1000 });
    expect(best_move).toBeOneOf([
      "g2g3",
      "g1f3",
      "e2e4",
      "d2d4",
      "c2c4",
      "e2e3",
    ]);
    best_move = await stockfish.get_best_move({
      wtime: 5 * 60 * 1000,
      btime: 1000,
    });
    expect(best_move).toBeOneOf(["e2e3", "e2e4", "g1f3", "b1c3", "d2d4"]);
  });

  it("set position resets info", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    await stockfish.get_best_move();
    expect(stockfish.info).not.toBe("");
    await stockfish.set_position(["e2e4", "e7e6"]);
    expect(stockfish.info).toBe("");
  });

  it("get best move not first move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    const best_move = await stockfish.get_best_move();
    expect(best_move).toBeOneOf(["d2d4", "g1f3"]);
  });

  it("get best move time not first move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    const best_move = await stockfish.get_best_move_time(1000);
    expect(best_move).toBeOneOf(["d2d4", "g1f3"]);
  });

  it("get best move remaining time not first move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    let best_move = await stockfish.get_best_move({ wtime: 1000 });
    expect(best_move).toBeOneOf(["d2d4", "a2a3", "d1e2", "b1c3"]);
    best_move = await stockfish.get_best_move({ btime: 1000 });
    expect(best_move).toBeOneOf(["d2d4", "b1c3"]);
    best_move = await stockfish.get_best_move({ wtime: 1000, btime: 1000 });
    expect(best_move).toBeOneOf(["d2d4", "b1c3", "g1f3"]);
    best_move = await stockfish.get_best_move({
      wtime: 5 * 60 * 1000,
      btime: 1000,
    });
    expect(best_move).toBeOneOf(["e2e3", "e2e4", "g1f3", "b1c3", "d2d4"]);
  });

  it("get best move checkmate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["f2f3", "e7e5", "g2g4", "d8h4"]);
    const best_move = await stockfish.get_best_move();
    expect(best_move).toBeNull();
  });

  it("get best move time checkmate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["f2f3", "e7e5", "g2g4", "d8h4"]);
    const best_move = await stockfish.get_best_move_time(1000);
    expect(best_move).toBeNull();
  });

  it("get best move remaining time checkmate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(await stockfish.get_best_move({ wtime: 1000 })).toBeNull();
    expect(await stockfish.get_best_move({ btime: 1000 })).toBeNull();
    expect(
      await stockfish.get_best_move({ wtime: 1000, btime: 1000 })
    ).toBeNull();
    expect(
      await stockfish.get_best_move({ wtime: 5 * 60 * 1000, btime: 1000 })
    ).toBeNull();
  });

  it("set fen position", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "7r/1pr1kppb/2n1p2p/2NpP2P/5PP1/1P6/P6K/R1R2B2 w - - 1 27"
    );
    expect(await stockfish.is_move_correct("f4f5")).toBeTrue();
    expect(await stockfish.is_move_correct("a1c1")).toBeFalse();
  });

  it("castling", async () => {
    const stockfish = await getDefaultStockfish();
    expect(await stockfish.is_move_correct("e1g1")).toBeFalse();
    await stockfish.set_fen_position(
      "rnbqkbnr/ppp3pp/3ppp2/8/4P3/5N2/PPPPBPPP/RNBQK2R w KQkq - 0 4"
    );
    expect(await stockfish.is_move_correct("e1g1")).toBeTrue();
  });

  it("set fen position mate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position("8/8/8/6pp/8/4k1PP/8/r3K3 w - - 12 53");
    expect(await stockfish.get_best_move()).toBeNull();
    expect(stockfish.info).toBe("info depth 0 score mate 0");
  });

  it("clear info after set new fen position", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position("8/8/8/6pp/8/4k1PP/r7/4K3 b - - 11 52");
    await stockfish.get_best_move();
    await stockfish.set_fen_position("8/8/8/6pp/8/4k1PP/8/r3K3 w - - 12 53");
    expect(stockfish.info).toBe("");
    await stockfish.set_fen_position("8/8/8/6pp/8/4k1PP/r7/4K3 b - - 11 52");
    await stockfish.get_best_move();
    await stockfish.set_fen_position(
      "8/8/8/6pp/8/4k1PP/8/r3K3 w - - 12 53",
      false
    );
    expect(stockfish.info).toBe("");
  });

  it("set fen position starts new game", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "7r/1pr1kppb/2n1p2p/2NpP2P/5PP1/1P6/P6K/R1R2B2 w - - 1 27"
    );
    await stockfish.get_best_move();
    expect(stockfish.info).not.toBe("");
    await stockfish.set_fen_position(
      "3kn3/p5rp/1p3p2/3B4/3P1P2/2P5/1P3K2/8 w - - 0 53"
    );
    expect(stockfish.info).toBe("");
  });

  it("fen position second argument", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(16);
    await stockfish.set_fen_position(
      "rnbqk2r/pppp1ppp/3bpn2/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 1",
      true
    );
    expect(await stockfish.get_best_move()).toBe("e4e5");
    await stockfish.set_fen_position(
      "rnbqk2r/pppp1ppp/3bpn2/4P3/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq - 0 1",
      false
    );
    expect(await stockfish.get_best_move()).toBeOneOf(["d6e7", "d6b4"]);
    await stockfish.set_fen_position(
      "rnbqk2r/pppp1ppp/3bpn2/8/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 1",
      false
    );
    expect(await stockfish.get_best_move()).toBe("e4e5");
  });

  it("is move correct first move", async () => {
    const stockfish = await getDefaultStockfish();
    expect(await stockfish.is_move_correct("e2e1")).toBeFalse();
    expect(await stockfish.is_move_correct("a2a3")).toBeTrue();
  });

  it("is move correct not first move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    expect(await stockfish.is_move_correct("e2e1")).toBeFalse();
    expect(await stockfish.is_move_correct("a2a3")).toBeTrue();
  });

  it("last info", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "r6k/6b1/2b1Q3/p6p/1p5q/3P2PP/5r1K/8 w - - 1 31"
    );
    await stockfish.get_best_move();
    for (const value of [
      "info",
      "depth",
      "seldepth",
      "multipv",
      "score",
      "mate",
      "-1",
      "nodes",
      "nps",
      "tbhits",
      "time",
      "pv",
      "h2g1",
      "h4g3",
    ]) {
      expect(stockfish.info).toContain(value);
    }
  });

  it("set_skill_level", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbqkbnr/ppp2ppp/3pp3/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1"
    );
    expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(20);
    await stockfish.set_skill_level(1);
    expect(await stockfish.get_best_move()).toBeOneOf([
      "b2b3",
      "d2d3",
      "d2d4",
      "b1c3",
      "d1e2",
      "g2g3",
      "c2c4",
      "f1e2",
      "c2c3",
      "h2h3",
    ]);
    expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(1);
    expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeFalse();
    await stockfish.set_skill_level(20);
    expect(await stockfish.get_best_move()).toBeOneOf(["d2d4", "c2c4"]);
    expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(20);
    expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeFalse();
  });

  it("set_elo_rating", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbqkbnr/ppp2ppp/3pp3/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1"
    );
    expect(stockfish.get_engine_parameters().UCI_Elo).toBe(1350);
    await stockfish.set_elo_rating(2000);
    expect(await stockfish.get_best_move()).toBeOneOf([
      "d2d4",
      "b1c3",
      "d1e2",
      "c2c4",
      "f1e2",
      "h2h3",
      "c2c3",
      "f1d3",
      "a2a3",
    ]);
    expect(stockfish.get_engine_parameters().UCI_Elo).toBe(2000);
    expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeTrue();
    await stockfish.set_elo_rating(1350);
    expect(await stockfish.get_best_move()).toBeOneOf([
      "d1e2",
      "b1c3",
      "d2d3",
      "d2d4",
      "c2c4",
      "f1e2",
      "c2c3",
      "f1b5",
      "g2g3",
      "h2h3",
    ]);
    expect(stockfish.get_engine_parameters().UCI_Elo).toBe(1350);
    expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeTrue();
    await stockfish.set_elo_rating(2850);
    expect(await stockfish.get_best_move()).toBeOneOf([
      "d2d4",
      "b1c3",
      "c2c3",
      "c2c4",
      "f1b5",
    ]);
    expect(stockfish.get_engine_parameters().UCI_Elo).toBe(2850);
  });

  it("resume_full_strength", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1r1qrbk1/2pb1pp1/p4n1p/P3P3/3P4/NB4BP/6P1/R2QR1K1 b - - 0 1"
    );
    stockfish.set_depth(13);
    await stockfish.set_elo_rating(1350);
    expect(stockfish._on_weaker_setting()).toBeTrue();
    const best_moves = ["d7c6", "d7f5"] as const;
    // low_elo_moves = [stockfish.get_best_move() for _ in range(15)]
    // expect(not all(x in best_moves for x in low_elo_moves)
    await stockfish.set_skill_level(1);
    expect(stockfish._on_weaker_setting()).toBeTrue();
    // low_skill_level_moves = [stockfish.get_best_move() for _ in range(15)]
    // expect(not all(x in best_moves for x in low_skill_level_moves)
    await stockfish.resume_full_strength();
    expect(stockfish._on_weaker_setting()).toBeFalse();
    // full_strength_moves = [stockfish.get_best_move() for _ in range(15)]
    // expect(all(x in best_moves for x in full_strength_moves)
  });

  it("specific params", async () => {
    const stockfish = await getDefaultStockfish();
    const old_parameters = {
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
      UCI_Chess960: false,
      UCI_LimitStrength: false,
      UCI_Elo: 1350,
    };
    const expected_parameters = structuredClone(old_parameters);
    await stockfish.set_skill_level(1);
    expected_parameters["Skill Level"] = 1;
    expect(stockfish.get_engine_parameters()).toEqual(expected_parameters);
    expect(Stockfish.DEFAULT_STOCKFISH_PARAMS).toEqual<unknown>(old_parameters);
    await stockfish.set_skill_level(20);
    expected_parameters["Skill Level"] = 20;
    expect(stockfish.get_engine_parameters()).toEqual(old_parameters);
    expect(Stockfish.DEFAULT_STOCKFISH_PARAMS).toEqual<unknown>(old_parameters);
    await stockfish.update_engine_parameters({ Threads: 4 });
    expected_parameters.Threads = 4;
    expect(stockfish.get_engine_parameters()).toEqual(expected_parameters);
    await stockfish.update_engine_parameters({ Hash: 128 });
    expected_parameters.Hash = 128;
    expect(stockfish.get_engine_parameters()).toEqual(expected_parameters);
    await stockfish.update_engine_parameters({ Hash: 256, Threads: 3 });
    Object.assign(expected_parameters, { Hash: 256, Threads: 3 });
    expect(stockfish.get_engine_parameters()).toEqual(expected_parameters);
  });

  it("update engine parameters wrong vals", async () => {
    const stockfish = await getDefaultStockfish();

    // expect(set(stockfish.get_engine_parameters().keys()) <= set(
    //     Stockfish._PARAM_RESTRICTIONS.keys()
    // )

    const bad_values = {
      Threads: ["1", false, 0, -1, 1025, 1.0],
      UCI_Chess960: ["true", "false", "true", 1],
      Contempt: [-101, 101, "0", false],
      UCI_LimitStrength: ["true", "false", "false", 1, 0],
      Ponder: ["true", "false", "true", "false", 0],
      Hash: [-1, 4096, -2048, true, 0],
      "Not key": [0],
    } as const;

    // for name in bad_values:
    //     for val in bad_values[name]:
    //         with pytest.raises(ValueError):
    //             stockfish.update_engine_parameters({name: val})
    //         with pytest.raises(ValueError):
    //         await  stockfish._set_option(name, val)
  });

  it("chess960 position", async () => {
    const stockfish = await getDefaultStockfish();
    expect(await stockfish.get_fen_position()).toContain("KQkq");
    const old_parameters = stockfish.get_engine_parameters();
    const expected_parameters = stockfish.get_engine_parameters();
    expected_parameters.UCI_Chess960 = true;
    await stockfish.update_engine_parameters({ UCI_Chess960: true });
    expect(await stockfish.get_fen_position()).toContain("HAha");
    expect(stockfish.get_engine_parameters()).toEqual(expected_parameters);
    await stockfish.set_fen_position("4rkr1/4p1p1/8/8/8/8/8/4nK1R w K - 0 100");
    expect(await stockfish.get_best_move()).toBe("f1h1");
    stockfish.set_turn_perspective(false);
    expect(await stockfish.get_evaluation()).toEqual({
      type: "mate",
      value: 2,
    });
    stockfish.set_turn_perspective(true);
    expect(await stockfish.get_evaluation()).toEqual({
      type: "mate",
      value: 2,
    });
    // fails, gives DIRECT_CAPTURE
    expect(await stockfish.will_move_be_a_capture("f1h1")).toBe(
      Capture.NO_CAPTURE
    );
    expect(await stockfish.will_move_be_a_capture("f1e1")).toBe(
      Capture.DIRECT_CAPTURE
    );
    await stockfish.update_engine_parameters({ UCI_Chess960: false });
    expect(stockfish.get_engine_parameters()).toEqual(old_parameters);
    expect(await stockfish.get_best_move()).toBe("f1g1");
    stockfish.set_turn_perspective(false);
    expect(await stockfish.get_evaluation()).toEqual({
      type: "mate",
      value: 2,
    });
    stockfish.set_turn_perspective(true);
    expect(await stockfish.get_evaluation()).toEqual({
      type: "mate",
      value: 2,
    });
    expect(await stockfish.will_move_be_a_capture("f1g1")).toBe(
      Capture.NO_CAPTURE
    );
  });

  it("get board visual white", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6", "d2d4", "d7d5"]);
    const expected_result = `\
+---+---+---+---+---+---+---+---+
| r | n | b | q | k | b | n | r | 8
+---+---+---+---+---+---+---+---+
| p | p | p |   |   | p | p | p | 7
+---+---+---+---+---+---+---+---+
|   |   |   |   | p |   |   |   | 6
+---+---+---+---+---+---+---+---+
|   |   |   | p |   |   |   |   | 5
+---+---+---+---+---+---+---+---+
|   |   |   | P | P |   |   |   | 4
+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   |   |   | 3
+---+---+---+---+---+---+---+---+
| P | P | P |   |   | P | P | P | 2
+---+---+---+---+---+---+---+---+
| R | N | B | Q | K | B | N | R | 1
+---+---+---+---+---+---+---+---+
  a   b   c   d   e   f   g   h
`;
    expect(await stockfish.get_board_visual()).toBe(expected_result);
  });

  it("get board visual black", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6", "d2d4", "d7d5"]);
    const expected_result = `\
+---+---+---+---+---+---+---+---+
| R | N | B | K | Q | B | N | R | 1
+---+---+---+---+---+---+---+---+
| P | P | P |   |   | P | P | P | 2
+---+---+---+---+---+---+---+---+
|   |   |   |   |   |   |   |   | 3
+---+---+---+---+---+---+---+---+
|   |   |   | P | P |   |   |   | 4
+---+---+---+---+---+---+---+---+
|   |   |   |   | p |   |   |   | 5
+---+---+---+---+---+---+---+---+
|   |   |   | p |   |   |   |   | 6
+---+---+---+---+---+---+---+---+
| p | p | p |   |   | p | p | p | 7
+---+---+---+---+---+---+---+---+
| r | n | b | k | q | b | n | r | 8
+---+---+---+---+---+---+---+---+
  h   g   f   e   d   c   b   a
`;
    expect(await stockfish.get_board_visual(false)).toBe(expected_result);
  });

  it("get fen position", async () => {
    const stockfish = await getDefaultStockfish();
    expect(await stockfish.get_fen_position()).toBe(
      Stockfish.STARTING_POSITION_FEN
    );
  });

  it("get fen position after some moves", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    expect(await stockfish.get_fen_position()).toBe(
      "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    );
  });

  it("get evaluation cp", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(20);
    await stockfish.set_fen_position(
      "r4rk1/pppb1p1p/2nbpqp1/8/3P4/3QBN2/PPP1BPPP/R4RK1 w - - 0 11"
    );
    const evaluation = await stockfish.get_evaluation();
    expect(evaluation.type).toBe("cp");
    expect(evaluation.value).toBeNumber();
    expect(evaluation.value).toBeGreaterThanOrEqual(60);
    expect(evaluation.value).toBeLessThanOrEqual(150);
    await stockfish.set_skill_level(1);
    expect(evaluation.type).toBe("cp");
    expect(evaluation.value).toBeNumber();
    expect(evaluation.value).toBeGreaterThanOrEqual(60);
    expect(evaluation.value).toBeLessThanOrEqual(150);
  });

  it("get_evaluation time", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "r4rk1/pppb1p1p/2nbpqp1/8/3P4/3QBN2/PPP1BPPP/R4RK1 w - - 0 11"
    );
    // start = time.time()
    const evaluation = await stockfish.get_evaluation(5000);
    // expect(round(time.time() - start)).toBe(5)
    expect(evaluation["type"]).toBe("cp");
    expect(evaluation.value).toBeWithin(30, 120);
  }, 7000);

  it("evaluation checkmate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1nb1k1n1/pppppppp/8/6r1/5bqK/6r1/8/8 w - - 2 2"
    );
    expect(await stockfish.get_evaluation()).toEqual({
      type: "mate",
      value: 0,
    });
  });

  it("evaluation stalemate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1nb1kqn1/pppppppp/8/6r1/5b1K/6r1/8/8 w - - 2 2"
    );
    expect(await stockfish.get_evaluation()).toEqual({ type: "cp", value: 0 });
    stockfish.set_turn_perspective(!stockfish.get_turn_perspective());
    expect(await stockfish.get_evaluation()).toEqual({ type: "cp", value: 0 });
  });

  it("static_eval", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_turn_perspective(false);
    await stockfish.set_fen_position("r7/8/8/8/8/5k2/4p3/4K3 w - - 0 1");
    const static_eval_1 = await stockfish.get_static_eval();
    expect(static_eval_1).toBeNumber();
    expect(static_eval_1).toBeLessThan(-3);
    await stockfish.set_fen_position("r7/8/8/8/8/5k2/4p3/4K3 b - - 0 1");
    const static_eval_2 = await stockfish.get_static_eval();
    expect(static_eval_2).toBeNumber();
    expect(static_eval_2).toBeLessThan(-3);
    stockfish.set_turn_perspective(true);
    const static_eval_3 = await stockfish.get_static_eval();
    expect(static_eval_3).toBeNumber();
    expect(static_eval_3).toBeGreaterThan(3);
    await stockfish.set_fen_position("r7/8/8/8/8/5k2/4p3/4K3 w - - 0 1");
    const static_eval_4 = await stockfish.get_static_eval();
    expect(static_eval_4).toBeNumber();
    expect(static_eval_4).toBeLessThan(-3);
    await stockfish.set_fen_position("8/8/8/8/8/4k3/4p3/r3K3 w - - 0 1");
    expect(await stockfish.get_static_eval()).toBeNull();
  });

  it("set_depth", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(12);
    expect(stockfish.get_depth()).toBe(12);
    stockfish.set_depth(Stockfish.DEFAULT_DEPTH);
    expect(stockfish.get_depth()).toBe(15);
  });

  it("set_depth raises type error", async () => {
    const stockfish = await getDefaultStockfish();
    for (const depth of ["12", true, 12.1, 0, null]) {
      expect(() => stockfish.set_depth(depth)).toThrow(TypeError);
    }
  });

  it("get_depth", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(12);
    expect(stockfish.get_depth()).toBe(12);
    stockfish.set_depth(20);
    expect(stockfish.get_depth()).toBe(20);
  });

  it("set_num_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_num_nodes(100);
    expect(stockfish.get_num_nodes()).toBe(100);
    stockfish.set_num_nodes(Stockfish.DEFAULT_NUM_NODES);
    expect(stockfish.get_num_nodes()).toBe(1000000);
  });

  it("set_num_nodes raises type error", async () => {
    const stockfish = await getDefaultStockfish();
    for (const num_nodes of ["100", 100.1, null, true]) {
      expect(() => stockfish.set_num_nodes(num_nodes)).toThrow(TypeError);
    }
  });

  it("get_num_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_num_nodes(100);
    expect(stockfish.get_num_nodes()).toBe(100);
    stockfish.set_num_nodes(Stockfish.DEFAULT_NUM_NODES);
    expect(stockfish.get_num_nodes()).toBe(1000000);
  });

  it("get_best_move wrong position", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(2);
    const wrong_fen = "3kk3/8/8/8/8/8/8/3KK3 w - - 0 0";
    await stockfish.set_fen_position(wrong_fen);
    expect(await stockfish.get_best_move()).toBeOneOf(["d1e2", "d1c1", "d1c2"]);
  });

  it("constructor", async () => {
    const stockfish = await getDefaultStockfish();
    // Will also use a new stockfish instance in order to test sending params to the constructor.
    // stockfish_2 = Stockfish(
    //     depth=16, parameters={"MultiPV": 2, "UCI_Elo": 2850, "UCI_Chess960": true}
    // )
    // expect((
    //     stockfish_2.get_fen_position()
    //    ).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1"
    // )
    // expect((
    //     stockfish.get_fen_position()
    //    ).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    // )
    // stockfish_2.get_best_move()
    // stockfish.get_best_move()
    // expect("multipv 2" in stockfish_2.info and "depth 16" in stockfish_2.info
    // expect("multipv 1" in stockfish.info and "depth 15" in stockfish.info
    // expect(stockfish_2._depth).toBe(16)
    // expect(stockfish._depth).toBe(15)
    // stockfish_1_params = stockfish.get_engine_parameters()
    // stockfish_2_params = stockfish_2.get_engine_parameters()

    // for key in stockfish_2_params.keys():
    //     if key).toBe("MultiPV":
    //         assert stockfish_2_params[key]).toBe(2 and stockfish_1_params[key]).toBe(1
    //     elif key).toBe("UCI_Elo":
    //         assert stockfish_2_params[key]).toBe(2850
    //         assert stockfish_1_params[key]).toBe(1350
    //     elif key).toBe("UCI_LimitStrength":
    //         assert stockfish_2_params[key]).toBeTrue()
    //         assert stockfish_1_params[key]).toBeFalse()
    //     elif key).toBe("UCI_Chess960":
    //         assert stockfish_2_params[key]).toBeTrue()
    //         assert stockfish_1_params[key]).toBeFalse()
    //     else:
    //         assert stockfish_2_params[key]).toBe(stockfish_1_params[key]
  });

  it("parameters functions", async () => {
    const stockfish = await getDefaultStockfish();
    const old_parameters = stockfish.get_engine_parameters();
    await stockfish.set_fen_position("4rkr1/4p1p1/8/8/8/8/8/5K1R w H - 0 100");
    expect(await stockfish.get_best_move()).toBe("f1g1"); // ensures Chess960 param is False
    expect(await stockfish.get_fen_position()).toBe(
      "4rkr1/4p1p1/8/8/8/8/8/5K1R w K - 0 100"
    );
    expect(stockfish.info).toContain("multipv 1");
    await stockfish.update_engine_parameters({
      "Minimum Thinking Time": 10,
      Hash: 32,
      MultiPV: 2,
      UCI_Chess960: true,
    });
    expect(await stockfish.get_fen_position()).toBe(
      "4rkr1/4p1p1/8/8/8/8/8/5K1R w H - 0 100"
    );
    expect(await stockfish.get_best_move()).toBe("f1h1");
    expect(stockfish.info).toContain("multipv 2");
    const updated_parameters = stockfish.get_engine_parameters();

    // for key, value in updated_parameters.items():
    //     if key == "Minimum Thinking Time":
    //         assert value).toBe(10
    //     elif key==="Hash":
    //         assert value).toBe(32
    //     elif key==="MultiPV":
    //         assert value).toBe(2
    //     elif key==="UCI_Chess960":
    //         assert value).toBeTrue()
    //     else:
    //         assert updated_parameters[key]).toBe(old_parameters[key]

    // expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeFalse()
    // stockfish.update_engine_parameters({"UCI_Elo": 2000, "Skill Level": 19})
    // expect(stockfish.get_engine_parameters().UCI_Elo).toBe(2000
    // expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(19
    // expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeFalse()
    // stockfish.update_engine_parameters({"UCI_Elo": 2000})
    // expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeTrue()
    // stockfish.update_engine_parameters({"Skill Level": 20})
    // expect(stockfish.get_engine_parameters().UCI_LimitStrength).toBeFalse()
    // expect(await stockfish.get_fen_position()).toBe("4rkr1/4p1p1/8/8/8/8/8/5K1R w H - 0 100"
    // stockfish.reset_engine_parameters()
    // expect(stockfish.get_engine_parameters()).toBe(old_parameters
    // expect(await stockfish.get_fen_position()).toBe("4rkr1/4p1p1/8/8/8/8/8/5K1R w K - 0 100"
    // with pytest.raises(ValueError):
    // stockfish.update_engine_parameters({"Not an existing key", "value"})  // type: ignore
  });

  it("test_get_top_moves", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    await stockfish._set_option("MultiPV", 4);
    await stockfish.set_fen_position(
      "1rQ1r1k1/5ppp/8/8/1R6/8/2r2PPP/4R1K1 w - - 0 1"
    );
    // expect(await stockfish.get_top_moves(2)).toBe([
    //     {"Move": "e1e8", "Centipawn": null, "Mate": 1},
    //     {"Move": "c8e8", "Centipawn": null, "Mate": 2},
    // ])
    await stockfish.set_fen_position("8/8/8/8/8/3r2k1/8/6K1 w - - 0 1");
    // expect(await stockfish.get_top_moves(2)).toBe([
    //   {"Move": "g1f1", "Centipawn": null, "Mate": -2},
    //   {"Move": "g1h1", "Centipawn": null, "Mate": -1},
    // ])
    // stockfish.set_elo_rating()
    // with pytest.warns(UserWarning):
    //     top_moves = await stockfish.get_top_moves(2)
    // expect(top_moves).toBe([
    //   {"Move": "g1f1", "Centipawn": null, "Mate": -2},
    //   {"Move": "g1h1", "Centipawn": null, "Mate": -1},
    // ])
  });

  it("get top moves mate", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(10);
    await stockfish._set_option("MultiPV", 3);
    await stockfish.set_fen_position("8/8/8/8/8/6k1/8/3r2K1 w - - 0 1");
    expect(await stockfish.get_top_moves()).toBe([]);
    expect(stockfish.get_engine_parameters().MultiPV).toBe(3);
  });

  it("get top moves verbose", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    await stockfish.set_fen_position(
      "1rQ1r1k1/5ppp/8/8/1R6/8/2r2PPP/4R1K1 w - - 0 1"
    );
    // expect(await stockfish.get_top_moves(2, verbose=false)).toBe([
    //     {"Move": "e1e8", "Centipawn": null, "Mate": 1},
    //     {"Move": "c8e8", "Centipawn": null, "Mate": 2},
    // ]
    const moves = await stockfish.get_top_moves(2, { verbose: true });
    // expect(all(
    //     k in moves[0]
    //     for k).toBeOneOf([
    //         "Move",
    //         "Centipawn",
    //         "Mate",e1g1
    //         "MultiPVLine",
    //         "NodesPerSecond",
    //         "Nodes",
    //         "SelectiveDepth",
    //         "Time",
    //     )
    // )
    // if stockfish.does_current_engine_version_have_wdl_option():
    //     assert "WDL" in moves[0]
  });

  it("test_get_top_moves_num_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "8/2q2pk1/4b3/1p6/7P/Q1p3P1/2B2P2/6K1 b - - 3 50"
    );
    const moves = await stockfish.get_top_moves(2, {
      num_nodes: 1000000,
      verbose: true,
    });
    // expect(int(moves[0]["Nodes"]) >= 1000000
  });

  it("test_get_top_moves_preserve_globals", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish._set_option("MultiPV", 4);
    stockfish.set_num_nodes(2000000);
    await stockfish.set_fen_position(
      "1rQ1r1k1/5ppp/8/8/1R6/8/2r2PPP/4R1K1 w - - 0 1"
    );
    await stockfish.get_top_moves(2, { num_nodes: 100000 });
    expect(stockfish.get_num_nodes()).toBe(2000000);
    expect(stockfish.get_engine_parameters().MultiPV).toBe(4);
  });

  it("test_get_top_moves_raises_value_error", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );

    // with pytest.raises(ValueError):
    //     stockfish.get_top_moves(0)

    expect(await stockfish.get_top_moves(2)).toBeArrayOfSize(2);
    expect(stockfish.get_engine_parameters().MultiPV).toBe(1);
  });

  it("test_get_perft_number_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    // @pytest.mark.parametrize(
    //     "depth, expected_num_nodes", [(1, 20), (2, 400), (3, 8902), (6, 119060324)]
    // )

    // num_nodes, move_possibilities = stockfish.get_perft(depth)
    // expect(num_nodes).toBe(expected_num_nodes)
    // expect(sum(move_possibilities.values())).toBe(expected_num_nodes
  });

  it("test_get_perft", async () => {
    const stockfish = await getDefaultStockfish();
    const { move_possibilities } = await stockfish.get_perft(1);
    expect(Object.keys(move_possibilities)).toBeArrayOfSize(20);
    // expect(all(k in move_possibilities.keys() for k).toBeOneOf(["a2a3", "g1h3"))
    // expect(set(move_possibilities.values())).toEqual({1}
    // move_possibilities2 = stockfish.get_perft(3)[1]
    // expect(move_possibilities.keys()).toBe(move_possibilities2.keys()
    // expect(min(move_possibilities2.values())).toBe(380
    // expect(max(move_possibilities2.values())).toBe(600
    // expect(move_possibilities2["f2f3"]).toBe(380 and move_possibilities2["e2e3"]).toBe(599
  });

  it("get perft raises type error", async () => {
    const stockfish = await getDefaultStockfish();
    for (const depth of [true, 0, "foo", 16.2]) {
      expect(() => stockfish.get_perft(depth)).toThrow(TypeError);
    }
  });

  it("get_perft different position", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position("1k6/7Q/1K6/8/8/8/8/8 w - - 0 1");
    const { num_nodes, move_possibilities } = await stockfish.get_perft(3);
    expect(num_nodes).toBe(1043);
    expect(move_possibilities["h7g8"]).toBe(0);
    expect(move_possibilities["h7b1"]).toBe(48);
  });

  it("flip", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.flip();
    expect(await stockfish.get_fen_position()).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    );
    await stockfish.set_fen_position("8/4q1k1/8/8/8/8/2K5/8 w - - 0 1");
    stockfish.flip();
    expect(await stockfish.get_fen_position()).toContain("b");
    stockfish.flip();
    expect(await stockfish.get_fen_position()).toContain("w");
    await stockfish.make_moves_from_current_position(["c2c3"]);
    stockfish.flip();
    expect(await stockfish.get_fen_position()).toContain("w");
  });

  it("turn perspective", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    await stockfish.set_fen_position(
      "8/2q2pk1/4b3/1p6/7P/Q1p3P1/2B2P2/6K1 b - - 3 50"
    );
    expect(stockfish.get_turn_perspective()).toBeTrue();
    const moves_1 = await stockfish.get_top_moves(1);
    expect(moves_1[0].Centipawn).toBeGreaterThan(0);
    // eval = await stockfish.get_evaluation()["value"]
    // expect(isinstance(eval, int) and eval > 0
    stockfish.set_turn_perspective(false);
    expect(stockfish.get_turn_perspective()).toBeFalse();
    const moves_2 = await stockfish.get_top_moves(1);
    // expect(moves_2[0]["Centipawn"] < 0
    // eval = await stockfish.get_evaluation()["value"]
    // expect(isinstance(eval, int) and eval < 0
  });

  it("turn perspective raises type error", async () => {
    const stockfish = await getDefaultStockfish();
    expect(stockfish.set_turn_perspective("not a bool")).toThrow(TypeError);
  });

  it("make_moves_from_current_position", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1"
    );
    const fen_1 = await stockfish.get_fen_position();
    await stockfish.make_moves_from_current_position([]);
    expect(await stockfish.get_fen_position()).toBe(fen_1);
    await stockfish.make_moves_from_current_position(["e1g1"]);
    expect(await stockfish.get_fen_position()).toBe(
      "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 1 1"
    );
    await stockfish.make_moves_from_current_position([
      "f6e4",
      "d2d4",
      "e4d6",
      "b5c6",
      "d7c6",
      "d4e5",
      "d6f5",
    ]);
    expect(await stockfish.get_fen_position()).toBe(
      "r1bqkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNBQ1RK1 w kq - 1 5"
    );
    await stockfish.make_moves_from_current_position([
      "d1d8",
      "e8d8",
      "b1c3",
      "d8e8",
      "f1d1",
      "f5e7",
      "h2h3",
      "f7f5",
    ]);
    expect(await stockfish.get_fen_position()).toBe(
      "r1b1kb1r/ppp1n1pp/2p5/4Pp2/8/2N2N1P/PPP2PP1/R1BR2K1 w - f6 0 9"
    );
    await stockfish.set_fen_position(
      "r1bqk2r/pppp1ppp/8/8/1b2n3/2N5/PPP2PPP/R1BQK2R w Qkq - 0 1"
    );
    // invalid_moves = ["d1e3", "e1g1", "c3d5", "c1d4", "a7a6", "e1d2", "word"]
    // for invalid_move in invalid_moves:
    //     with pytest.raises(ValueError):
    //         stockfish.make_moves_from_current_position([invalid_move])
  });

  it("make_moves transposition table speed", async () => {
    const stockfish = await getDefaultStockfish();
    // ----------------
    // make_moves_from_current_position won't send the "ucinewgame" token to Stockfish,
    // since it will reach a new position similar to the current one.
    //
    // Meanwhile, set_fen_position will send this token (unless the user specifies otherwise),
    // since it could be going to a completely new position.
    //
    // A big effect of sending this token is that it resets SF's transposition table.
    // If the new position is similar to the current one, this will affect SF's speed.
    // This function tests that make_moves_from_current_position doesn't reset the transposition table,
    // by verifying SF is faster in evaluating a consecutive set of positions when the make_moves_from_current_position function is used.
    // ----------------

    stockfish.set_depth(16);
    const positions_considered = [];
    await stockfish.set_fen_position(
      "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2"
    );
    // total_time_calculating_first = 0.0

    // for i in range(5):
    //     start = default_timer()
    //     chosen_move = stockfish.get_best_move()
    //     assert isinstance(chosen_move, str)
    //     total_time_calculating_first += default_timer() - start
    //     positions_considered.append(await stockfish.get_fen_position())
    //     stockfish.make_moves_from_current_position([chosen_move])

    // total_time_calculating_second = 0.0

    // for i in range(len(positions_considered)):
    //   await stockfish.set_fen_position(positions_considered[i])
    //     start = default_timer()
    //     stockfish.get_best_move()
    //     total_time_calculating_second += default_timer() - start

    // expect(total_time_calculating_first < total_time_calculating_second
  });

  it("get wdl stats", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    await stockfish._set_option("MultiPV", 2);
    expect(stockfish.get_wdl_stats()).not.rejects.toThrow();
    // await stockfish.set_fen_position("7k/4R3/4P1pp/7N/8/8/1q5q/3K4 w - - 0 1")
    //   wdl_stats = stockfish.get_wdl_stats()
    //   assert isinstance(wdl_stats, list)
    //   assert wdl_stats[1] > wdl_stats[0] * 7
    //   assert abs(wdl_stats[0] - wdl_stats[2]) / wdl_stats[0] < 0.15
    // await stockfish.set_fen_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    //   wdl_stats_2 = stockfish.get_wdl_stats()
    //   assert isinstance(wdl_stats_2, list)
    //   assert wdl_stats_2[1] > wdl_stats_2[0] * 3.5
    //   assert wdl_stats_2[0] > wdl_stats_2[2] * 1.8
    // await stockfish.set_fen_position("8/8/8/8/8/6k1/6p1/6K1 w - - 0 1")
    //   assert stockfish.get_wdl_stats()).toBeNull()
    // await stockfish.set_fen_position(
    //       "rnbqkb1r/pp3ppp/3p1n2/1B2p3/3NP3/2N5/PPP2PPP/R1BQK2R b KQkq - 0 6"
    //   )
    //   wdl_stats_3 = stockfish.get_wdl_stats()
    //   assert isinstance(wdl_stats_3, list) and len(wdl_stats_3)).toBe(3
    //   stockfish._prepare_for_new_position()
    //   wdl_stats_4 = stockfish.get_wdl_stats(get_as_tuple=true)
    //   assert isinstance(wdl_stats_4, tuple) and len(wdl_stats_4)).toBe(3
    //   assert wdl_stats_3).toBe(list(wdl_stats_4)
    //   assert tuple(wdl_stats_3)).toBe(wdl_stats_4
    // await stockfish.set_fen_position("8/8/8/8/8/3k4/3p4/3K4 w - - 0 1")
    //   assert stockfish.get_wdl_stats()).toBeNull()
    //   stockfish.set_skill_level(1)
    //   with pytest.warns(UserWarning):
    //       stockfish.get_wdl_stats()
  });

  it("multiple quit commands", async () => {
    const stockfish = await getDefaultStockfish();
    // Test multiple quit commands, and include a call to del too. All of
    // them should run without causing some Exception.
    expect(stockfish.has_quit).toBeFalse();
    // expect(not stockfish._has_quit_command_been_sent
    stockfish._put("quit");
    // expect(stockfish._has_quit_command_been_sent
    stockfish._put("quit");
    // expect(stockfish._has_quit_command_been_sent
    // stockfish.__del__()
    // expect(stockfish._stockfish.exitCode).not.toBeNull()
    // expect(stockfish._has_quit_command_been_sent
    // stockfish._put(f"go depth {10}")
    // Should do nothing, and change neither of the values below.
    // expect(stockfish._stockfish.exitCode).not.toBeNull()
    // expect(stockfish._has_quit_command_been_sent
  });

  it("what is on square", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbq1rk1/ppp1ppbp/5np1/3pP3/8/BPN5/P1PP1PPP/R2QKBNR w KQ d6 0 6"
    );

    const squares_and_contents = {
      a1: Piece.WHITE_ROOK,
      a8: Piece.BLACK_ROOK,
      g8: Piece.BLACK_KING,
      e1: Piece.WHITE_KING,
      h2: Piece.WHITE_PAWN,
      f8: Piece.BLACK_ROOK,
      d6: null,
      h7: Piece.BLACK_PAWN,
      c3: Piece.WHITE_KNIGHT,
      a3: Piece.WHITE_BISHOP,
      h8: null,
      d1: Piece.WHITE_QUEEN,
      d4: null,
      f6: Piece.BLACK_KNIGHT,
      g7: Piece.BLACK_BISHOP,
      d8: Piece.BLACK_QUEEN,
    };

    // for notation, piece in squares_and_contents.items():
    //     assert stockfish.get_what_is_on_square(notation) is piece

    // with pytest.raises(ValueError):
    //     stockfish.get_what_is_on_square("i1")

    // with pytest.raises(ValueError):
    //     stockfish.get_what_is_on_square("b9")
  });

  it("13 return values from what_is_on_square", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbq1rk1/ppp1ppbp/5np1/3pP3/8/BPN5/P1PP1PPP/R2QKBNR w KQ d6 0 6"
    );

    // expected_enum_members = [
    //     "WHITE_PAWN",
    //     "BLACK_PAWN",
    //     "WHITE_KNIGHT",
    //     "BLACK_KNIGHT",
    //     "WHITE_BISHOP",
    //     "BLACK_BISHOP",
    //     "WHITE_ROOK",
    //     "BLACK_ROOK",
    //     "WHITE_QUEEN",
    //     "BLACK_QUEEN",
    //     "WHITE_KING",
    //     "BLACK_KING",
    // ]

    // rows = ["a", "b", "c", "d", "e", "f", "g", "h"]
    // cols = ["1", "2", "3", "4", "5", "6", "7", "8"]

    // for row in rows:
    //     for col in cols:
    //         val = stockfish.get_what_is_on_square(row + col)
    //         assert val).toBeNull() or val.name in expected_enum_members
  });

  it("test_will_move_be_a_capture", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1nbq1rk1/Ppp1ppbp/5np1/3pP3/8/BPN5/P1PP1PPP/R2QKBNR w KQ d6 0 6"
    );
    const c3d5_result = await stockfish.will_move_be_a_capture("c3d5");
    expect(c3d5_result).toBe(Capture.DIRECT_CAPTURE);

    const e5d6_result = await stockfish.will_move_be_a_capture("e5d6");
    // expect(
    //     e5d6_result is Capture.EN_PASSANT
    //     and e5d6_result.name).toBe("EN_PASSANT"
    //     and e5d6_result.value).toBe("en passant"
    // )
    // f1e2_result = await stockfish.will_move_be_a_capture("f1e2")
    // expect(
    //     f1e2_result is Capture.NO_CAPTURE
    //     and f1e2_result.name).toBe("NO_CAPTURE"
    //     and f1e2_result.value).toBe("no capture"
    // )
    // e5f6_result = await stockfish.will_move_be_a_capture("e5f6")
    // expect(
    //     e5f6_result is Capture.DIRECT_CAPTURE
    //     and e5f6_result.name).toBe("DIRECT_CAPTURE"
    //     and e5f6_result.value).toBe("direct capture"
    // )
    // a3d6_result = await stockfish.will_move_be_a_capture("a3d6")
    // expect(
    //     a3d6_result is Capture.NO_CAPTURE
    //     and a3d6_result.name).toBe("NO_CAPTURE"
    //     and a3d6_result.value).toBe("no capture"
    // )
    // a7a8q_result = await stockfish.will_move_be_a_capture("a7a8q")
    // expect(
    //     a7a8q_result is Capture.NO_CAPTURE
    //     and a7a8q_result.name).toBe("NO_CAPTURE"
    //     and a7a8q_result.value).toBe("no capture"
    // )
    // a7a8b_result = await stockfish.will_move_be_a_capture("a7a8b")
    // expect((
    //     a7a8b_result is Capture.NO_CAPTURE
    //     and a7a8b_result.name).toBe("NO_CAPTURE"
    //     and a7a8b_result.value).toBe("no capture"
    // )
    // a7b8q_result = await stockfish.will_move_be_a_capture("a7b8q")
    // expect((
    //     a7b8q_result is Capture.DIRECT_CAPTURE
    //     and a7b8q_result.name).toBe("DIRECT_CAPTURE"
    //     and a7b8q_result.value).toBe("direct capture"
    // )
    // a7b8r_result = await stockfish.will_move_be_a_capture("a7b8r")
    // expect(
    //     a7b8r_result is Capture.DIRECT_CAPTURE
    //     and a7b8r_result.name).toBe("DIRECT_CAPTURE"
    //     and a7b8r_result.value).toBe("direct capture"
    // )
    // with pytest.raises(ValueError):
    //     stockfish.will_move_be_a_capture("c3c5")
  });

  describe("invalid fen king attacked", async () => {
    // Each of these FENs have correct syntax, but involve a king being attacked while it's the opponent's turn.
    for (const fen of [
      "2k2q2/8/8/8/8/8/8/2Q2K2 w - - 0 1",
      "1q2nB2/pP1k2KP/NN1Q1qP1/8/1P1p4/4p1br/3R4/6n1 w - - 0 1",
      "3rk1n1/ppp3pp/8/8/8/8/PPP5/1KR1R3 w - - 0 1",
    ]) {
      it(`fen ${fen}`, async () => {
        const stockfish = await getDefaultStockfish();
        expect(Stockfish.is_fen_syntax_valid(fen)).toBeTrue();
        expect(await stockfish.is_fen_valid(fen)).toBeFalse();
        await stockfish.set_fen_position(fen);
        expect(stockfish.get_evaluation()).rejects.toThrow(StockfishError);
      });
    }

    const fen = "8/8/8/3k4/3K4/8/8/8 b - - 0 1";
    // For this FEN SF 15 outputs a best move without crashing (unlike SF 14 and earlier).
    it(`fen ${fen}`, async () => {
      const stockfish = await getDefaultStockfish();
      expect(Stockfish.is_fen_syntax_valid(fen)).toBeTrue();
      expect(await stockfish.is_fen_valid(fen)).toBeTrue();
      await stockfish.set_fen_position(fen);
      expect(stockfish.get_evaluation()).rejects.toThrow(StockfishError);
    });
  });

  it("is fen valid", async () => {
    const stockfish = await getDefaultStockfish();
    const old_params = stockfish.get_engine_parameters();
    const old_info = stockfish.info;
    const old_depth = stockfish.get_depth();
    const old_fen = await stockfish.get_fen_position();
    const correct_fens = [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 8",
      "4k3/8/4K3/8/8/8/8/8 w - - 10 50",
      "r1b1kb1r/ppp2ppp/3q4/8/P2Q4/8/1PP2PPP/RNB2RK1 w kq - 8 15",
      "4k3/8/4K3/8/8/8/8/8 w - - 99 50",
    ] as const;

    const invalid_syntax_fens = [
      "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK b kq - 0 8",
      "rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 3",
      "rn1q1rk1/pbppbppp/1p2pn2/8/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w w - 5 7",
      "4k3/8/4K3/71/8/8/8/8 w - - 10 50",
      "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2R2 b kq - 0 8",
      "r1bQ1b1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 8",
      "4k3/8/4K3/8/8/8/8/8 w - - 100 50",
      "4k3/8/4K3/8/8/8/8/8 w - - 101 50",
      "4k3/8/4K3/8/8/8/8/8 w - - -1 50",
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0",
      "r1b1kb1r/ppp2ppp/3q4/8/P2Q4/8/1PP2PPP/RNB2RK1 w kq - - 8 15",
      "r1b1kb1r/ppp2ppp/3q4/8/P2Q4/8/1PP2PPP/RNB2RK1 w kq 8 15",
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR W KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR - KQkq - 0 1",
      "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - - 8",
      "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 -",
      "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - -1 8",
      "4k3/8/4K3/8/8/8/8/8 w - - 99 e",
      "4k3/8/4K3/8/8/8/8/8 w - - 99 ee",
    ] as const;

    // correct_fens.extend([null] * (len(invalid_syntax_fens) - len(correct_fens)))
    // expect((correct_fens.length)).toBe((invalid_syntax_fens.length))

    // for correct_fen, invalid_syntax_fen in zip(correct_fens, invalid_syntax_fens):
    //     if correct_fen !== null:
    //         assert stockfish.is_fen_valid(correct_fen)
    //         assert stockfish._is_fen_syntax_valid(correct_fen)
    //     assert not stockfish.is_fen_valid(invalid_syntax_fen)
    //     assert not stockfish._is_fen_syntax_valid(invalid_syntax_fen)

    Bun.sleepSync(2000);

    expect(stockfish.has_quit).toBeFalse();
    expect(stockfish.get_engine_parameters()).toBe(old_params);
    expect(stockfish.info).toBe(old_info);
    expect(stockfish.get_depth()).toBe(old_depth);
    expect(await stockfish.get_fen_position()).toBe(old_fen);
  });

  it("send quit command", async () => {
    const stockfish = await getDefaultStockfish();
    expect(stockfish.has_quit).toBeFalse();
    await stockfish.quit_stockfish();
    expect(stockfish.has_quit).toBeTrue();
  });

  it("get stockfish major version", async () => {
    const stockfish = await getDefaultStockfish();
    expect(stockfish.get_stockfish_major_version()).toBeInteger();
    expect(stockfish.get_stockfish_major_version()).toBeWithin(12, 18);
  });

  it("get engine parameters", async () => {
    const stockfish = await getDefaultStockfish();
    const params = stockfish.get_engine_parameters();
    Object.assign(params, { "Skill Level": 10 });
    expect(params["Skill Level"]).toBe(10);
    expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(20);
  });
});
