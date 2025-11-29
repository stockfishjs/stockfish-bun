import { describe, it, expect } from "bun:test";

// from timeit import default_timer
// import time

import { Stockfish, Capture, StockfishError } from "~/py-stockfish";

const getDefaultStockfish = () =>
  Stockfish.create({ path: process.env.STOCKFISH_PATH });

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
    const stockfish = await Stockfish.create({
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

  it("test_get_best_move_not_first_move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    const best_move = await stockfish.get_best_move();
    expect(best_move).toBeOneOf(["d2d4", "g1f3"]);
  });

  it("test_get_best_move_time_not_first_move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    const best_move = await stockfish.get_best_move_time(1000);
    expect(best_move).toBeOneOf(["d2d4", "g1f3"]);
  });

  it("test_get_best_move_remaining_time_not_first_move", async () => {
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

  it("set_fen_position_mate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position("8/8/8/6pp/8/4k1PP/8/r3K3 w - - 12 53");
    expect(await stockfish.get_best_move()).toBeNull();
    expect(stockfish.info).toBe("info depth 0 score mate 0");
  });

  it("clear_info_after_set_new_fen_position", async () => {
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

  it("test_set_fen_position_starts_new_game", async () => {
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

  it("test_set_fen_position_second_argument", async () => {
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

  it("test_is_move_correct_first_move", async () => {
    const stockfish = await getDefaultStockfish();
    expect(await stockfish.is_move_correct("e2e1")).toBeFalse();
    expect(await stockfish.is_move_correct("a2a3")).toBeTrue();
  });

  it("test_is_move_correct_not_first_move", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    expect(await stockfish.is_move_correct("e2e1")).toBeFalse();
    expect(await stockfish.is_move_correct("a2a3")).toBeTrue();
  });

  it("test_last_info", async () => {
    const stockfish = await getDefaultStockfish();
    // //     @pytest.mark.parametrize(
    // //         "value",
    // //         [
    // //             "info", "depth", "seldepth", "multipv", "score", "mate", "-1", "nodes",
    // //             "nps", "tbhits", "time", "pv", "h2g1", "h4g3"
    // //         ]
    // //     )

    // //     def test_last_info(self, stockfish: Stockfish, value):
    // //         stockfish.set_fen_position("r6k/6b1/2b1Q3/p6p/1p5q/3P2PP/5r1K/8 w - - 1 31")
    // //         stockfish.get_best_move()
    // expect(stockfish.info).toContain(value);
  });

  it("test_set_skill_level", async () => {
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
    expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeFalse();
    await stockfish.set_skill_level(20);
    expect(await stockfish.get_best_move()).toBeOneOf(["d2d4", "c2c4"]);
    expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(20);
    expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeFalse();
  });

  it("test_set_elo_rating", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbqkbnr/ppp2ppp/3pp3/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1"
    );
    expect(stockfish.get_engine_parameters()["UCI_Elo"]).toBe(1350);
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
    expect(stockfish.get_engine_parameters()["UCI_Elo"]).toBe(2000);
    expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeTrue();
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

  it("test_resume_full_strength", async () => {
    const stockfish = await getDefaultStockfish();
    // //         stockfish.set_fen_position("1r1qrbk1/2pb1pp1/p4n1p/P3P3/3P4/NB4BP/6P1/R2QR1K1 b - - 0 1")
    // //         stockfish.set_depth(13)
    // //         stockfish.set_elo_rating(1350)
    // expect(stockfish._on_weaker_setting())
    // //         best_moves = ["d7c6", "d7f5"]
    // //         low_elo_moves = [stockfish.get_best_move() for _ in range(15)]
    // expect(not all(x in best_moves for x in low_elo_moves)
    // //         stockfish.set_skill_level(1)
    // expect(stockfish._on_weaker_setting()
    // //         low_skill_level_moves = [stockfish.get_best_move() for _ in range(15)]
    // expect(not all(x in best_moves for x in low_skill_level_moves)
    // //         stockfish.resume_full_strength()
    // expect(not stockfish._on_weaker_setting()
    // //         full_strength_moves = [stockfish.get_best_move() for _ in range(15)]
    // expect(all(x in best_moves for x in full_strength_moves)
  });

  it("test_specific_params", async () => {
    const stockfish = await getDefaultStockfish();
    //         old_parameters = {
    //             "Debug Log File": "",
    //             "Contempt": 0,
    //             "Min Split Depth": 0,
    //             "Threads": 1,
    //             "Ponder": false,
    //             "Hash": 16,
    //             "MultiPV": 1,
    //             "Skill Level": 20,
    //             "Move Overhead": 10,
    //             "Minimum Thinking Time": 20,
    //             "Slow Mover": 100,
    //             "UCI_Chess960": false,
    //             "UCI_LimitStrength": false,
    //             "UCI_Elo": 1350,
    //         }
    //         expected_parameters = old_parameters.copy()
    //         stockfish.set_skill_level(1)
    //         expected_parameters["Skill Level"] = 1
    expect(stockfish.get_engine_parameters()).toBe(expected_parameters);
    expect(Stockfish.DEFAULT_STOCKFISH_PARAMS).toBe(old_parameters);
    //         stockfish.set_skill_level(20)
    //         expected_parameters["Skill Level"] = 20
    expect(stockfish.get_engine_parameters()).toBe(old_parameters);
    expect(Stockfish.DEFAULT_STOCKFISH_PARAMS).toBe(old_parameters);
    //         stockfish.update_engine_parameters({"Threads": 4})
    //         expected_parameters["Threads"] = 4
    expect(stockfish.get_engine_parameters()).toBe(expected_parameters);
    //         stockfish.update_engine_parameters({"Hash": 128})
    //         expected_parameters["Hash"] = 128
    expect(stockfish.get_engine_parameters()).toBe(expected_parameters);
    //         stockfish.update_engine_parameters({"Hash": 256, "Threads": 3})
    //         expected_parameters.update({"Hash": 256, "Threads": 3})
    expect(stockfish.get_engine_parameters()).toBe(expected_parameters);
  });

  it("test_update_engine_parameters_wrong_vals", async () => {
    // //     def test_update_engine_parameters_wrong_vals(self, stockfish: Stockfish):
    // expect(set(stockfish.get_engine_parameters().keys()) <= set(
    // //             Stockfish._PARAM_RESTRICTIONS.keys()
    // //         )
    // //         bad_values: dict[str, list] = {
    // //             "Threads": ["1", false, 0, -1, 1025, 1.0],
    // //             "UCI_Chess960": ["true", "false", "true", 1],
    // //             "Contempt": [-101, 101, "0", false],
    // //             "UCI_LimitStrength": ["true", "false", "false", 1, 0],
    // //             "Ponder": ["true", "false", "true", "false", 0],
    // //             "Hash": [-1, 4096, -2048, true, 0],
    // //             "Not key": [0],
    // //         }
    // //         for name in bad_values:
    // //             for val in bad_values[name]:
    // //                 with pytest.raises(ValueError):
    // //                     stockfish.update_engine_parameters({name: val})
    // //                 with pytest.raises(ValueError):
    // //                     stockfish._set_option(name, val)
  });

  it("test_chess960_position", async () => {
    const stockfish = await getDefaultStockfish();
    // expect("KQkq" in stockfish.get_fen_position()
    // //         old_parameters = stockfish.get_engine_parameters()
    // //         expected_parameters = stockfish.get_engine_parameters()
    // //         expected_parameters["UCI_Chess960"] = true
    // //         stockfish.update_engine_parameters({"UCI_Chess960": true})
    // expect("HAha" in stockfish.get_fen_position()
    // expect(stockfish.get_engine_parameters()).toBe(expected_parameters
    // //         stockfish.set_fen_position("4rkr1/4p1p1/8/8/8/8/8/4nK1R w K - 0 100")
    // expect(await stockfish.get_best_move()).toBe("f1h1"
    // //         stockfish.set_turn_perspective(false)
    // expect(stockfish.get_evaluation()).toBe({"type": "mate", "value": 2}
    // //         stockfish.set_turn_perspective()
    // expect(stockfish.get_evaluation()).toBe({"type": "mate", "value": 2}
    // expect(stockfish.will_move_be_a_capture("f1h1") is Stockfish.Capture.NO_CAPTURE
    // expect(stockfish.will_move_be_a_capture("f1e1") is Stockfish.Capture.DIRECT_CAPTURE
    // //         stockfish.update_engine_parameters({"UCI_Chess960": false})
    // expect(stockfish.get_engine_parameters()).toBe(old_parameters
    // expect(await stockfish.get_best_move()).toBe("f1g1"
    // //         stockfish.set_turn_perspective(false)
    // expect(stockfish.get_evaluation()).toBe({"type": "mate", "value": 2}
    // //         stockfish.set_turn_perspective()
    // expect(stockfish.get_evaluation()).toBe({"type": "mate", "value": 2}
    // expect(stockfish.will_move_be_a_capture("f1g1") is Stockfish.Capture.NO_CAPTURE
  });

  it("test_get_board_visual_white", async () => {
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

  it("test_get_board_visual_black", async () => {
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

  it("test_get_fen_position", async () => {
    const stockfish = await getDefaultStockfish();
    expect(await stockfish.get_fen_position()).toBe(
      Stockfish.STARTING_POSITION_FEN
    );
  });

  it("test_get_fen_position_after_some_moves", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_position(["e2e4", "e7e6"]);
    expect(await stockfish.get_fen_position()).toBe(
      "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    );
  });

  it("test_get_evaluation_cp", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(20);
    await stockfish.set_fen_position(
      "r4rk1/pppb1p1p/2nbpqp1/8/3P4/3QBN2/PPP1BPPP/R4RK1 w - - 0 11"
    );
    const evaluation = stockfish.get_evaluation();
    // expect((
    // //             evaluation["type"]).toBe("cp"
    // //             and isinstance(evaluation["value"], int)
    // //             and evaluation["value"] >= 60
    // //             and evaluation["value"] <= 150
    // //         )
    // //         stockfish.set_skill_level(1)
    // //         with pytest.warns(UserWarning):
    // //             evaluation = stockfish.get_evaluation()
    // expect((
    // //             evaluation["type"]).toBe("cp"
    // //             and isinstance(evaluation["value"], int)
    // //             and evaluation["value"] >= 60
    // //             and evaluation["value"] <= 150
    // //         )
  });

  it("test_get_evaluation_time", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "r4rk1/pppb1p1p/2nbpqp1/8/3P4/3QBN2/PPP1BPPP/R4RK1 w - - 0 11"
    );
    // start = time.time()
    // evaluation = stockfish.get_evaluation(searchtime=5000)
    // expect(round(time.time() - start)).toBe(5)
    // expect(evaluation["type"]).toBe("cp")
    // expect(30 < evaluation["value"] < 120)
  });

  it("test_get_evaluation_checkmate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1nb1k1n1/pppppppp/8/6r1/5bqK/6r1/8/8 w - - 2 2"
    );
    expect(await stockfish.get_evaluation()).toBe({ type: "mate", value: 0 });
  });

  it("test_get_evaluation_stalemate", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1nb1kqn1/pppppppp/8/6r1/5b1K/6r1/8/8 w - - 2 2"
    );
    expect(await stockfish.get_evaluation()).toBe({ type: "cp", value: 0 });
    stockfish.set_turn_perspective(!stockfish.get_turn_perspective());
    expect(await stockfish.get_evaluation()).toBe({ type: "cp", value: 0 });
  });

  it("test_get_static_eval", async () => {
    // const stockfish = await getDefaultStockfish();
    // stockfish.set_turn_perspective(false);
    // // stockfish.set_fen_position("r7/8/8/8/8/5k2/4p3/4K3 w - - 0 1")
    // // static_eval_1 = stockfish.get_static_eval()
    // expect(isinstance(static_eval_1, float) and static_eval_1 < -3
    // // stockfish.set_fen_position("r7/8/8/8/8/5k2/4p3/4K3 b - - 0 1")
    // // static_eval_2 = stockfish.get_static_eval()
    // expect(isinstance(static_eval_2, float) and static_eval_2 < -3
    // // stockfish.set_turn_perspective()
    // // static_eval_3 = stockfish.get_static_eval()
    // expect(isinstance(static_eval_3, float) and static_eval_3 > 3
    // // stockfish.set_fen_position("r7/8/8/8/8/5k2/4p3/4K3 w - - 0 1")
    // // static_eval_4 = stockfish.get_static_eval()
    // expect(isinstance(static_eval_4, float) and static_eval_4 < -3
    // // if stockfish.get_stockfish_major_version() >= 12:
    // //     stockfish.set_fen_position("8/8/8/8/8/4k3/4p3/r3K3 w - - 0 1")
    // //     assert stockfish.get_static_eval()).toBeNull()
    // await stockfish.set_position();
    // // stockfish.get_static_eval()
    // // stockfish._put("go depth 2")
    // expect(stockfish._read_line()).not.toBe("")
  });

  it("test_set_depth", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(12);
    expect(stockfish.get_depth()).toBe(12);
    stockfish.set_depth(Stockfish.DEFAULT_DEPTH);
    expect(stockfish.get_depth()).toBe(15);
  });

  it("test_set_depth_raises_type_error", async () => {
    //     @pytest.mark.parametrize("depth", ["12", true, 12.1, 0, None])
    //     def test_set_depth_raises_type_error(self, stockfish: Stockfish, depth):
    //         with pytest.raises(TypeError):
    //             stockfish.set_depth(depth)
  });

  it("test_get_depth", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(12);
    expect(stockfish.get_depth()).toBe(12);
    stockfish.set_depth(20);
    expect(stockfish.get_depth()).toBe(20);
  });

  it("test_set_num_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_num_nodes(100);
    expect(stockfish.get_num_nodes()).toBe(100);
    stockfish.set_num_nodes(Stockfish.DEFAULT_NUM_NODES);
    expect(stockfish.get_num_nodes()).toBe(1000000);
  });

  it("test_set_num_nodes_raises_type_error", async () => {
    const stockfish = await getDefaultStockfish();
    //     @pytest.mark.parametrize("num_nodes", ["100", 100.1, None, true])
    //     def test_set_num_nodes_raises_type_error(self, stockfish: Stockfish, num_nodes):
    //         with pytest.raises(TypeError):
    //             stockfish.set_num_nodes(num_nodes)
  });

  it("test_get_num_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_num_nodes(100);
    expect(stockfish.get_num_nodes()).toBe(100);
    stockfish.set_num_nodes(Stockfish.DEFAULT_NUM_NODES);
    expect(stockfish.get_num_nodes()).toBe(1000000);
  });

  it("test_get_best_move_wrong_position", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(2);
    const wrong_fen = "3kk3/8/8/8/8/8/8/3KK3 w - - 0 0";
    await stockfish.set_fen_position(wrong_fen);
    expect(await stockfish.get_best_move()).toBeOneOf(["d1e2", "d1c1", "d1c2"]);
  });

  it("test_constructor", async () => {
    const stockfish = await getDefaultStockfish();
    // //         // Will also use a new stockfish instance in order to test sending
    // //         // params to the constructor.
    // //         stockfish_2 = Stockfish(
    // //             depth=16, parameters={"MultiPV": 2, "UCI_Elo": 2850, "UCI_Chess960": true}
    // //         )
    // expect((
    // //             stockfish_2.get_fen_position()
    // //            ).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1"
    // //         )
    // expect((
    // //             stockfish.get_fen_position()
    // //            ).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    // //         )
    // //         stockfish_2.get_best_move()
    // //         stockfish.get_best_move()
    // expect("multipv 2" in stockfish_2.info and "depth 16" in stockfish_2.info
    // expect("multipv 1" in stockfish.info and "depth 15" in stockfish.info
    // expect(stockfish_2._depth).toBe(16 and stockfish._depth).toBe(15)
    // //         stockfish_1_params = stockfish.get_engine_parameters()
    // //         stockfish_2_params = stockfish_2.get_engine_parameters()
    // //         for key in stockfish_2_params.keys():
    // //             if key).toBe("MultiPV":
    // //                 assert stockfish_2_params[key]).toBe(2 and stockfish_1_params[key]).toBe(1
    // //             elif key).toBe("UCI_Elo":
    // //                 assert stockfish_2_params[key]).toBe(2850
    // //                 assert stockfish_1_params[key]).toBe(1350
    // //             elif key).toBe("UCI_LimitStrength":
    // //                 assert stockfish_2_params[key]).toBeTrue()
    // //                 assert stockfish_1_params[key]).toBeFalse()
    // //             elif key).toBe("UCI_Chess960":
    // //                 assert stockfish_2_params[key]).toBeTrue()
    // //                 assert stockfish_1_params[key]).toBeFalse()
    // //             else:
    // //                 assert stockfish_2_params[key]).toBe(stockfish_1_params[key]
  });

  it("test_parameters_functions", async () => {
    const stockfish = await getDefaultStockfish();
    // //         old_parameters = stockfish.get_engine_parameters()
    // //         stockfish.set_fen_position("4rkr1/4p1p1/8/8/8/8/8/5K1R w H - 0 100")
    // expect(await stockfish.get_best_move()).toBe("f1g1"  // ensures Chess960 param).toBeFalse().
    // expect(stockfish.get_fen_position()).toBe("4rkr1/4p1p1/8/8/8/8/8/5K1R w K - 0 100"
    // expect("multipv 1" in stockfish.info
    // //         stockfish.update_engine_parameters(
    // //             {"Minimum Thinking Time": 10, "Hash": 32, "MultiPV": 2, "UCI_Chess960": true}
    // //         )
    // expect(stockfish.get_fen_position()).toBe("4rkr1/4p1p1/8/8/8/8/8/5K1R w H - 0 100"
    // expect(await stockfish.get_best_move()).toBe("f1h1"
    // expect("multipv 2" in stockfish.info
    // //         updated_parameters = stockfish.get_engine_parameters()
    // //         for key, value in updated_parameters.items():
    // //             if key).toBe("Minimum Thinking Time":
    // //                 assert value).toBe(10
    // //             elif key).toBe("Hash":
    // //                 assert value).toBe(32
    // //             elif key).toBe("MultiPV":
    // //                 assert value).toBe(2
    // //             elif key).toBe("UCI_Chess960":
    // //                 assert value).toBeTrue()
    // //             else:
    // //                 assert updated_parameters[key]).toBe(old_parameters[key]
    // expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeFalse()
    // //         stockfish.update_engine_parameters({"UCI_Elo": 2000, "Skill Level": 19})
    // expect(stockfish.get_engine_parameters()["UCI_Elo"]).toBe(2000
    // expect(stockfish.get_engine_parameters()["Skill Level"]).toBe(19
    // expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeFalse()
    // //         stockfish.update_engine_parameters({"UCI_Elo": 2000})
    // expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeTrue()
    // //         stockfish.update_engine_parameters({"Skill Level": 20})
    // expect(stockfish.get_engine_parameters()["UCI_LimitStrength"]).toBeFalse()
    // expect(stockfish.get_fen_position()).toBe("4rkr1/4p1p1/8/8/8/8/8/5K1R w H - 0 100"
    // //         stockfish.reset_engine_parameters()
    // expect(stockfish.get_engine_parameters()).toBe(old_parameters
    // expect(stockfish.get_fen_position()).toBe("4rkr1/4p1p1/8/8/8/8/8/5K1R w K - 0 100"
    // //         with pytest.raises(ValueError):
    // //             stockfish.update_engine_parameters({"Not an existing key", "value"})  // type: ignore
  });

  it("test_get_top_moves", async () => {
    const stockfish = await getDefaultStockfish();
            stockfish.set_depth(15)
    //         stockfish._set_option("MultiPV", 4)
    //         stockfish.set_fen_position("1rQ1r1k1/5ppp/8/8/1R6/8/2r2PPP/4R1K1 w - - 0 1")
    // expect(stockfish.get_top_moves(2)).toBe([
    // //             {"Move": "e1e8", "Centipawn": None, "Mate": 1},
    // //             {"Move": "c8e8", "Centipawn": None, "Mate": 2},
    //         ])
    // //         stockfish.set_fen_position("8/8/8/8/8/3r2k1/8/6K1 w - - 0 1")
    // expect(stockfish.get_top_moves(2)).toBe([
    // //             {"Move": "g1f1", "Centipawn": None, "Mate": -2},
    // //             {"Move": "g1h1", "Centipawn": None, "Mate": -1},
    //         ])
    // //         stockfish.set_elo_rating()
    // //         with pytest.warns(UserWarning):
    // //             top_moves = stockfish.get_top_moves(2)
    // expect(top_moves).toBe([
    //             {"Move": "g1f1", "Centipawn": null, "Mate": -2},
    //             {"Move": "g1h1", "Centipawn": null, "Mate": -1},
    // ])
  });

  it("test_get_top_moves_mate", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(10);
    // stockfish._set_option("MultiPV", 3)
    // stockfish.set_fen_position("8/8/8/8/8/6k1/8/3r2K1 w - - 0 1")
    // expect(stockfish.get_top_moves()).toBe([]
    // expect(stockfish.get_engine_parameters()["MultiPV"]).toBe(3
  });

  it("test_get_top_moves_verbose", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    await stockfish.set_fen_position(
      "1rQ1r1k1/5ppp/8/8/1R6/8/2r2PPP/4R1K1 w - - 0 1"
    );
    // expect(stockfish.get_top_moves(2, verbose=false)).toBe([
    // //             {"Move": "e1e8", "Centipawn": None, "Mate": 1},
    // //             {"Move": "c8e8", "Centipawn": None, "Mate": 2},
    // //         ]
    // //         moves = stockfish.get_top_moves(2, verbose=true)
    // expect(all(
    // //             k in moves[0]
    // //             for k).toBeOneOf([
    // //                 "Move",
    // //                 "Centipawn",
    // //                 "Mate",e1g1
    // //                 "MultiPVLine",
    // //                 "NodesPerSecond",
    // //                 "Nodes",
    // //                 "SelectiveDepth",
    // //                 "Time",
    // //             )
    // //         )
    // //         if stockfish.does_current_engine_version_have_wdl_option():
    // //             assert "WDL" in moves[0]
  });

  it("test_get_top_moves_num_nodes", async () => {
    const stockfish = await getDefaultStockfish();
    // //         stockfish.set_fen_position("8/2q2pk1/4b3/1p6/7P/Q1p3P1/2B2P2/6K1 b - - 3 50")
    // //         moves = stockfish.get_top_moves(2, num_nodes=1000000, verbose=true)
    // expect(int(moves[0]["Nodes"]) >= 1000000
  });

  it("test_get_top_moves_preserve_globals", async () => {
    const stockfish = await getDefaultStockfish();
    //         stockfish._set_option("MultiPV", 4)
    //         stockfish.set_num_nodes(2000000)
    //         stockfish.set_fen_position("1rQ1r1k1/5ppp/8/8/1R6/8/2r2PPP/4R1K1 w - - 0 1")
    //         stockfish.get_top_moves(2, num_nodes=100000)
    // expect(stockfish.get_num_nodes()).toBe(2000000
    // expect(stockfish.get_engine_parameters()["MultiPV"]).toBe(4
  });

  it("test_get_top_moves_raises_value_error", async () => {
    const stockfish = await getDefaultStockfish();
    //         stockfish.set_fen_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    //         with pytest.raises(ValueError):
    //             stockfish.get_top_moves(0)
    // expect(len(stockfish.get_top_moves(2))).toBe(2
    // expect(stockfish.get_engine_parameters()["MultiPV"]).toBe(1
  });

  it("test_get_perft_number_nodes", async () => {
    //     @pytest.mark.parametrize(
    //         "depth, expected_num_nodes", [(1, 20), (2, 400), (3, 8902), (6, 119060324)]
    //     )
    //     def test_get_perft_number_nodes(
    //         self, stockfish: Stockfish, depth: int, expected_num_nodes: int
    //     ):
    //         num_nodes, move_possibilities = stockfish.get_perft(depth)
    // expect(num_nodes).toBe(expected_num_nodes
    // expect(sum(move_possibilities.values())).toBe(expected_num_nodes
  });

  it("test_get_perft", async () => {
    const stockfish = await getDefaultStockfish();
    // //         move_possibilities = stockfish.get_perft(1)[1]
    // expect(len(move_possibilities)).toBe(20
    // expect(all(k in move_possibilities.keys() for k).toBeOneOf(["a2a3", "g1h3"))
    // expect(set(move_possibilities.values())).toBe({1}
    // //         move_possibilities2 = stockfish.get_perft(3)[1]
    // expect(move_possibilities.keys()).toBe(move_possibilities2.keys()
    // expect(min(move_possibilities2.values())).toBe(380
    // expect(max(move_possibilities2.values())).toBe(600
    // expect(move_possibilities2["f2f3"]).toBe(380 and move_possibilities2["e2e3"]).toBe(599
  });

  it("test_get_perft_raises_type_error", async () => {
    //     @pytest.mark.parametrize("depth", [true, 0, "foo", 16.2])
    //     def test_get_perft_raises_type_error(self, stockfish: Stockfish, depth):
    //         with pytest.raises(TypeError):
    //             stockfish.get_perft(depth)
  });

  it("test_get_perft_different_position", async () => {
    //     def test_get_perft_different_position(self, stockfish: Stockfish):
    //         stockfish.set_fen_position("1k6/7Q/1K6/8/8/8/8/8 w - - 0 1")
    //         num_nodes, move_possibilities = stockfish.get_perft(3)
    // expect(num_nodes).toBe(1043
    // expect(move_possibilities["h7g8"]).toBe(0
    // expect(move_possibilities["h7b1"]).toBe(48
  });

  it("test_flip", async () => {
    //     def test_flip(self, stockfish: Stockfish):
    //         stockfish.flip()
    // expect((
    // //             "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    // //            ).toBe(stockfish.get_fen_position()
    // //         )
    // //         stockfish.set_fen_position("8/4q1k1/8/8/8/8/2K5/8 w - - 0 1")
    // //         stockfish.flip()
    // expect("b" in stockfish.get_fen_position()
    // //         stockfish.flip()
    // expect("w" in stockfish.get_fen_position()
    // //         stockfish.make_moves_from_current_position(["c2c3"])
    // //         stockfish.flip()
    // expect("w" in stockfish.get_fen_position()
  });

  it("test_turn_perspective", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    await stockfish.set_fen_position(
      "8/2q2pk1/4b3/1p6/7P/Q1p3P1/2B2P2/6K1 b - - 3 50"
    );
    expect(stockfish.get_turn_perspective()).toBeTrue();
    const moves = await stockfish.get_top_moves(1);
    // expect(moves[0]["Centipawn"] > 0
    // //         eval = stockfish.get_evaluation()["value"]
    // expect(isinstance(eval, int) and eval > 0
    // //         stockfish.set_turn_perspective(false)
    // expect(stockfish.get_turn_perspective()).toBeFalse()
    // //         moves = stockfish.get_top_moves(1)
    // expect(moves[0]["Centipawn"] < 0
    // //         eval = stockfish.get_evaluation()["value"]
    // expect(isinstance(eval, int) and eval < 0
  });

  it("test_turn_perspective_raises_type_error", async () => {
    const stockfish = await getDefaultStockfish();
    //         with pytest.raises(TypeError):
    //             stockfish.set_turn_perspective("not a bool")  // type: ignore
  });

  it("test_make_moves_from_current_position", async () => {
    const stockfish = await getDefaultStockfish();
    // //         stockfish.set_fen_position(
    // //             "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1"
    // //         )
    // //         fen_1 = stockfish.get_fen_position()
    // //         stockfish.make_moves_from_current_position([])
    // expect(fen_1).toBe(stockfish.get_fen_position())
    // //         stockfish.make_moves_from_current_position(["e1g1"])
    // expect((
    // //             stockfish.get_fen_position()
    // //            ).toBe("r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 1 1"
    // //         )
    // //         stockfish.make_moves_from_current_position(
    // //             ["f6e4", "d2d4", "e4d6", "b5c6", "d7c6", "d4e5", "d6f5"]
    // //         )
    // expect((
    // //             stockfish.get_fen_position()
    // //            ).toBe("r1bqkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNBQ1RK1 w kq - 1 5"
    // //         )
    // //         stockfish.make_moves_from_current_position(
    // //             ["d1d8", "e8d8", "b1c3", "d8e8", "f1d1", "f5e7", "h2h3", "f7f5"]
    // //         )
    // expect((
    // //             stockfish.get_fen_position()
    // //            ).toBe("r1b1kb1r/ppp1n1pp/2p5/4Pp2/8/2N2N1P/PPP2PP1/R1BR2K1 w - f6 0 9"
    // //         )
    // //         stockfish.set_fen_position("r1bqk2r/pppp1ppp/8/8/1b2n3/2N5/PPP2PPP/R1BQK2R w Qkq - 0 1")
    // //         invalid_moves = ["d1e3", "e1g1", "c3d5", "c1d4", "a7a6", "e1d2", "word"]
    // //         for invalid_move in invalid_moves:
    // //             with pytest.raises(ValueError):
    // //                 stockfish.make_moves_from_current_position([invalid_move])
  });

  it("test_make_moves_transposition_table_speed", async () => {
    const stockfish = await getDefaultStockfish();
    //         """
    //         make_moves_from_current_position won't send the "ucinewgame" token to Stockfish, since it
    //         will reach a new position similar to the current one. Meanwhile, set_fen_position will send this
    //         token (unless the user specifies otherwise), since it could be going to a completely new position.
    //         A big effect of sending this token is that it resets SF's transposition table. If the
    //         new position is similar to the current one, this will affect SF's speed. This function tests
    //         that make_moves_from_current_position doesn't reset the transposition table, by verifying SF is faster in
    //         evaluating a consecutive set of positions when the make_moves_from_current_position function is used.
    //         """
    //         stockfish.set_depth(16)
    //         positions_considered = []
    //         stockfish.set_fen_position("rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2")
    //         total_time_calculating_first = 0.0
    //         for i in range(5):
    //             start = default_timer()
    //             chosen_move = stockfish.get_best_move()
    //             assert isinstance(chosen_move, str)
    //             total_time_calculating_first += default_timer() - start
    //             positions_considered.append(stockfish.get_fen_position())
    //             stockfish.make_moves_from_current_position([chosen_move])
    //         total_time_calculating_second = 0.0
    //         for i in range(len(positions_considered)):
    //             stockfish.set_fen_position(positions_considered[i])
    //             start = default_timer()
    //             stockfish.get_best_move()
    //             total_time_calculating_second += default_timer() - start
    // expect(total_time_calculating_first < total_time_calculating_second
  });

  it("test_get_wdl_stats", async () => {
    const stockfish = await getDefaultStockfish();
    stockfish.set_depth(15);
    //         stockfish._set_option("MultiPV", 2)
    //         if stockfish.does_current_engine_version_have_wdl_option():
    //             stockfish.get_wdl_stats()  // Testing that this doesn't raise a RuntimeError.
    //             stockfish.set_fen_position("7k/4R3/4P1pp/7N/8/8/1q5q/3K4 w - - 0 1")
    //             wdl_stats = stockfish.get_wdl_stats()
    //             assert isinstance(wdl_stats, list)
    //             assert wdl_stats[1] > wdl_stats[0] * 7
    //             assert abs(wdl_stats[0] - wdl_stats[2]) / wdl_stats[0] < 0.15
    //             stockfish.set_fen_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    //             wdl_stats_2 = stockfish.get_wdl_stats()
    //             assert isinstance(wdl_stats_2, list)
    //             assert wdl_stats_2[1] > wdl_stats_2[0] * 3.5
    //             assert wdl_stats_2[0] > wdl_stats_2[2] * 1.8
    //             stockfish.set_fen_position("8/8/8/8/8/6k1/6p1/6K1 w - - 0 1")
    //             assert stockfish.get_wdl_stats()).toBeNull()
    //             stockfish.set_fen_position(
    //                 "rnbqkb1r/pp3ppp/3p1n2/1B2p3/3NP3/2N5/PPP2PPP/R1BQK2R b KQkq - 0 6"
    //             )
    //             wdl_stats_3 = stockfish.get_wdl_stats()
    //             assert isinstance(wdl_stats_3, list) and len(wdl_stats_3)).toBe(3
    //             stockfish._prepare_for_new_position()
    //             wdl_stats_4 = stockfish.get_wdl_stats(get_as_tuple=true)
    //             assert isinstance(wdl_stats_4, tuple) and len(wdl_stats_4)).toBe(3
    //             assert wdl_stats_3).toBe(list(wdl_stats_4)
    //             assert tuple(wdl_stats_3)).toBe(wdl_stats_4
    //             stockfish.set_fen_position("8/8/8/8/8/3k4/3p4/3K4 w - - 0 1")
    //             assert stockfish.get_wdl_stats()).toBeNull()
    //             stockfish.set_skill_level(1)
    //             with pytest.warns(UserWarning):
    //                 stockfish.get_wdl_stats()
    //         else:
    //             with pytest.raises(RuntimeError):
    //                 stockfish.get_wdl_stats()
  });

  it("test_does_current_engine_version_have_wdl_option", async () => {
    const stockfish = await getDefaultStockfish();
    //         if stockfish.get_stockfish_major_version() <= 11:
    //             assert not stockfish.does_current_engine_version_have_wdl_option()
    //             with pytest.raises(RuntimeError):
    //                 stockfish.get_wdl_stats()
  });

  it("test_benchmark_result_with_defaults", async () => {
    const stockfish = await getDefaultStockfish();
    //         params = stockfish.BenchmarkParameters()
    //         result = stockfish.benchmark(params)
    //         // result should contain the last line of a successful method call
    // expect(result.split(" ")[0]).toBe("Nodes/second"
  });

  it("test_benchmark_result_with_valid_options", async () => {
    const stockfish = await getDefaultStockfish();
    //         params = stockfish.BenchmarkParameters(
    //             ttSize=64, threads=2, limit=1000, limitType="movetime", evalType="classical"
    //         )
    //         result = stockfish.benchmark(params)
    //         // result should contain the last line of a successful method call
    // expect(result.split(" ")[0]).toBe("Nodes/second"
  });

  it("test_benchmark_result_with_invalid_options", async () => {
    const stockfish = await getDefaultStockfish();
    //         params = stockfish.BenchmarkParameters(
    //             ttSize=2049,
    //             threads=0,
    //             limit=0,
    //             fenFile="./fakefile.fen",
    //             limitType="fghthtr",
    //             evalType="",
    //         )
    //         result = stockfish.benchmark(params)
    //         // result should contain the last line of a successful method call
    // expect(result.split(" ")[0]).toBe("Nodes/second"
  });

  it("test_benchmark_result_with_invalid_type", async () => {
    const stockfish = await getDefaultStockfish();
    //         params = {
    //             "ttSize": 16,
    //             "threads": 1,
    //             "limit": 13,
    //             "fenFile": "./fakefile.fen",
    //             "limitType": "depth",
    //             "evalType": "mixed",
    //         }
    //         result = stockfish.benchmark(params)  // type: ignore
    //         // result should contain the last line of a successful method call
    // expect(result.split(" ")[0]).toBe("Nodes/second"
  });

  it("test_multiple_quit_commands", async () => {
    const stockfish = await getDefaultStockfish();
    // //         // Test multiple quit commands, and include a call to del too. All of
    // //         // them should run without causing some Exception.
    // expect(stockfish._stockfish.exitCode).toBeNull()
    // expect(not stockfish._has_quit_command_been_sent
    // //         stockfish._put("quit")
    // expect(stockfish._has_quit_command_been_sent
    // //         stockfish._put("quit")
    // expect(stockfish._has_quit_command_been_sent
    // //         stockfish.__del__()
    // expect(stockfish._stockfish.exitCode).not.toBeNull()
    // expect(stockfish._has_quit_command_been_sent
    // //         stockfish._put(f"go depth {10}")
    // //         // Should do nothing, and change neither of the values below.
    // expect(stockfish._stockfish.exitCode).not.toBeNull()
    // expect(stockfish._has_quit_command_been_sent
  });

  it("test_what_is_on_square", async () => {
    const stockfish = await getDefaultStockfish();
    //         stockfish.set_fen_position(
    //             "rnbq1rk1/ppp1ppbp/5np1/3pP3/8/BPN5/P1PP1PPP/R2QKBNR w KQ d6 0 6"
    //         )
    //         squares_and_contents: dict[str, Stockfish.Piece | None] = {
    //             "a1": Stockfish.Piece.WHITE_ROOK,
    //             "a8": Stockfish.Piece.BLACK_ROOK,
    //             "g8": Stockfish.Piece.BLACK_KING,
    //             "e1": Stockfish.Piece.WHITE_KING,
    //             "h2": Stockfish.Piece.WHITE_PAWN,
    //             "f8": Stockfish.Piece.BLACK_ROOK,
    //             "d6": None,
    //             "h7": Stockfish.Piece.BLACK_PAWN,
    //             "c3": Stockfish.Piece.WHITE_KNIGHT,
    //             "a3": Stockfish.Piece.WHITE_BISHOP,
    //             "h8": None,
    //             "d1": Stockfish.Piece.WHITE_QUEEN,
    //             "d4": None,
    //             "f6": Stockfish.Piece.BLACK_KNIGHT,
    //             "g7": Stockfish.Piece.BLACK_BISHOP,
    //             "d8": Stockfish.Piece.BLACK_QUEEN,
    //         }
    //         for notation, piece in squares_and_contents.items():
    //             assert stockfish.get_what_is_on_square(notation) is piece
    //         with pytest.raises(ValueError):
    //             stockfish.get_what_is_on_square("i1")
    //         with pytest.raises(ValueError):
    //             stockfish.get_what_is_on_square("b9")
  });

  it("test_13_return_values_from_what_is_on_square", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "rnbq1rk1/ppp1ppbp/5np1/3pP3/8/BPN5/P1PP1PPP/R2QKBNR w KQ d6 0 6"
    );
    //         expected_enum_members = [
    //             "WHITE_PAWN",
    //             "BLACK_PAWN",
    //             "WHITE_KNIGHT",
    //             "BLACK_KNIGHT",
    //             "WHITE_BISHOP",
    //             "BLACK_BISHOP",
    //             "WHITE_ROOK",
    //             "BLACK_ROOK",
    //             "WHITE_QUEEN",
    //             "BLACK_QUEEN",
    //             "WHITE_KING",
    //             "BLACK_KING",
    //         ]
    //         rows = ["a", "b", "c", "d", "e", "f", "g", "h"]
    //         cols = ["1", "2", "3", "4", "5", "6", "7", "8"]
    //         for row in rows:
    //             for col in cols:
    //                 val = stockfish.get_what_is_on_square(row + col)
    //                 assert val).toBeNull() or val.name in expected_enum_members
  });

  it("test_will_move_be_a_capture", async () => {
    const stockfish = await getDefaultStockfish();
    await stockfish.set_fen_position(
      "1nbq1rk1/Ppp1ppbp/5np1/3pP3/8/BPN5/P1PP1PPP/R2QKBNR w KQ d6 0 6"
    );
    const c3d5_result = await stockfish.will_move_be_a_capture("c3d5");
    expect(c3d5_result).toBe(Capture.DIRECT_CAPTURE);

    // //         e5d6_result = stockfish.will_move_be_a_capture("e5d6")
    // expect((
    // //             e5d6_result is Stockfish.Capture.EN_PASSANT
    // //             and e5d6_result.name).toBe("EN_PASSANT"
    // //             and e5d6_result.value).toBe("en passant"
    // //         )
    // //         f1e2_result = stockfish.will_move_be_a_capture("f1e2")
    // expect((
    // //             f1e2_result is Stockfish.Capture.NO_CAPTURE
    // //             and f1e2_result.name).toBe("NO_CAPTURE"
    // //             and f1e2_result.value).toBe("no capture"
    // //         )
    // //         e5f6_result = stockfish.will_move_be_a_capture("e5f6")
    // expect((
    // //             e5f6_result is Stockfish.Capture.DIRECT_CAPTURE
    // //             and e5f6_result.name).toBe("DIRECT_CAPTURE"
    // //             and e5f6_result.value).toBe("direct capture"
    // //         )
    // //         a3d6_result = stockfish.will_move_be_a_capture("a3d6")
    // expect((
    // //             a3d6_result is Stockfish.Capture.NO_CAPTURE
    // //             and a3d6_result.name).toBe("NO_CAPTURE"
    // //             and a3d6_result.value).toBe("no capture"
    // //         )
    // //         a7a8q_result = stockfish.will_move_be_a_capture("a7a8q")
    // expect((
    // //             a7a8q_result is Stockfish.Capture.NO_CAPTURE
    // //             and a7a8q_result.name).toBe("NO_CAPTURE"
    // //             and a7a8q_result.value).toBe("no capture"
    // //         )
    // //         a7a8b_result = stockfish.will_move_be_a_capture("a7a8b")
    // expect((
    // //             a7a8b_result is Stockfish.Capture.NO_CAPTURE
    // //             and a7a8b_result.name).toBe("NO_CAPTURE"
    // //             and a7a8b_result.value).toBe("no capture"
    // //         )
    // //         a7b8q_result = stockfish.will_move_be_a_capture("a7b8q")
    // expect((
    // //             a7b8q_result is Stockfish.Capture.DIRECT_CAPTURE
    // //             and a7b8q_result.name).toBe("DIRECT_CAPTURE"
    // //             and a7b8q_result.value).toBe("direct capture"
    // //         )
    // //         a7b8r_result = stockfish.will_move_be_a_capture("a7b8r")
    // expect((
    // //             a7b8r_result is Stockfish.Capture.DIRECT_CAPTURE
    // //             and a7b8r_result.name).toBe("DIRECT_CAPTURE"
    // //             and a7b8r_result.value).toBe("direct capture"
    // //         )
    // //         with pytest.raises(ValueError):
    // //             stockfish.will_move_be_a_capture("c3c5")
  });

  it("test_invalid_fen_king_attacked", async () => {
    const stockfish = await getDefaultStockfish();
    //     @pytest.mark.parametrize(
    //         "fen",
    //         [
    //             "2k2q2/8/8/8/8/8/8/2Q2K2 w - - 0 1",
    //             "8/8/8/3k4/3K4/8/8/8 b - - 0 1",
    //             "1q2nB2/pP1k2KP/NN1Q1qP1/8/1P1p4/4p1br/3R4/6n1 w - - 0 1",
    //             "3rk1n1/ppp3pp/8/8/8/8/PPP5/1KR1R3 w - - 0 1",
    //         ],
    //     )

    // Each of these FENs have correct syntax, but
    // involve a king being attacked while it's the opponent's turn.
    expect(Stockfish._is_fen_syntax_valid(fen)).toBeTrue();
    //         if fen).toBe("8/8/8/3k4/3K4/8/8/8 b - - 0 1" and stockfish.get_stockfish_major_version() >= 14:
    //             // Since for that FEN, SF 15 actually outputs a best move without crashing (unlike SF 14 and earlier).
    //             return
    //         if (
    //             fen).toBe("2k2q2/8/8/8/8/8/8/2Q2K2 w - - 0 1"
    //             and stockfish.get_stockfish_major_version() >= 15
    //         ):
    //             // Development versions post SF 15 seem to output a bestmove for this fen.
    //             return
    expect(stockfish.is_fen_valid(fen)).toBeFalse();
    await stockfish.set_fen_position(fen);
    //         with pytest.raises(StockfishError):
    //             stockfish.get_evaluation()
  });

  it("test_is_fen_valid", async () => {
    const stockfish = await getDefaultStockfish();
    //         // old_params = stockfish.get_engine_parameters()
    //         // old_info = stockfish.info
    //         // old_depth = stockfish._depth
    //         // old_fen = stockfish.get_fen_position()
    //         // correct_fens: list[str | None] = [
    //         //     "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    //         //     "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 8",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - 10 50",
    //         //     "r1b1kb1r/ppp2ppp/3q4/8/P2Q4/8/1PP2PPP/RNB2RK1 w kq - 8 15",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - 99 50",
    //         // ]
    //         // invalid_syntax_fens = [
    //         //     "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK b kq - 0 8",
    //         //     "rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 3",
    //         //     "rn1q1rk1/pbppbppp/1p2pn2/8/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w w - 5 7",
    //         //     "4k3/8/4K3/71/8/8/8/8 w - - 10 50",
    //         //     "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2R2 b kq - 0 8",
    //         //     "r1bQ1b1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 8",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - 100 50",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - 101 50",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - -1 50",
    //         //     "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0",
    //         //     "r1b1kb1r/ppp2ppp/3q4/8/P2Q4/8/1PP2PPP/RNB2RK1 w kq - - 8 15",
    //         //     "r1b1kb1r/ppp2ppp/3q4/8/P2Q4/8/1PP2PPP/RNB2RK1 w kq 8 15",
    //         //     "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR W KQkq - 0 1",
    //         //     "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR - KQkq - 0 1",
    //         //     "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - - 8",
    //         //     "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - 0 -",
    //         //     "r1bQkb1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 b kq - -1 8",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - 99 e",
    //         //     "4k3/8/4K3/8/8/8/8/8 w - - 99 ee",
    //         // ]
    //         // correct_fens.extend([None] * (len(invalid_syntax_fens) - len(correct_fens)))
    // expect((correct_fens.length)).toBe((invalid_syntax_fens.length))
    // //         for correct_fen, invalid_syntax_fen in zip(correct_fens, invalid_syntax_fens):
    // //             if correct_fen).not.toBeNull():
    // //                 assert stockfish.is_fen_valid(correct_fen)
    // //                 assert stockfish._is_fen_syntax_valid(correct_fen)
    // //             assert not stockfish.is_fen_valid(invalid_syntax_fen)
    // //             assert not stockfish._is_fen_syntax_valid(invalid_syntax_fen)
    // //         time.sleep(2.0)
    // expect(stockfish._stockfish.exitCode).toBeNull()
    // expect(stockfish.get_engine_parameters()).toBe(old_params)
    // expect(stockfish.info).toBe(old_info)
    // expect(stockfish._depth).toBe(old_depth)
    // expect(stockfish.get_fen_position()).toBe(old_fen)
  });

  it("test_send_quit_command", async () => {
    const stockfish = await getDefaultStockfish();
    expect(stockfish._stockfish.exitCode).toBeNull();
    stockfish.send_quit_command();
    expect(stockfish._stockfish.exitCode).not.toBeNull();
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
