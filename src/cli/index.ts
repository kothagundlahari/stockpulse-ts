import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { Command } from "commander";
import { getLiveNifty50Fundamentals, mergeFundamentals } from "../data/live-nifty50.js";
import { PERSONALITIES } from "../data/nifty50.js";
import { BacktestEngine, type DailyPrice, smaCrossover } from "../engines/backtest.js";
import { DatabaseService } from "../services/database.js";
import { FyersClient } from "../services/fyers.js";
import { fetchStockNews } from "../services/news.js";
import { OllamaService } from "../services/ollama.js";
import { YahooFinanceService } from "../services/yahoo-finance.js";

const program = new Command();

program.name("stockpulse").description("AI-powered Indian stock research CLI").version("1.0.0");

program
  .command("quote <symbol>")
  .description("Get a live stock quote")
  .action(async (symbol: string) => {
    const yahoo = new YahooFinanceService();
    try {
      const quote = await yahoo.getQuote(symbol.toUpperCase());
      console.log(`${chalk.bold(quote.symbol)} @ ₹${quote.ltp.toFixed(2)}`);
      console.log(
        `  Change: ${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`,
      );
      console.log(
        `  Open: ₹${quote.open.toFixed(2)}  High: ₹${quote.high.toFixed(2)}  Low: ₹${quote.low.toFixed(2)}`,
      );
      console.log(`  Volume: ${quote.volume.toLocaleString()}`);
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("news <symbol>")
  .description("Fetch recent news for a stock")
  .action(async (symbol: string) => {
    try {
      const items = await fetchStockNews(symbol.toUpperCase());
      if (items.length === 0) {
        console.log(chalk.yellow("No news found."));
        return;
      }
      console.log(chalk.bold(`\nRecent news for ${symbol.toUpperCase()}:\n`));
      items.forEach((item, i) => {
        console.log(`${i + 1}. ${chalk.cyan(item.title)}`);
        console.log(`   ${chalk.dim(item.source)} | ${chalk.dim(item.pubDate)}`);
        console.log(`   ${chalk.dim(item.link)}\n`);
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

const VALID_RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"];

program
  .command("backtest <symbol>")
  .description("Run a backtest on a stock")
  .option("-s, --strategy <name>", "strategy: buy_hold, sma_crossover", "buy_hold")
  .option("-c, --capital <amount>", "initial capital", "100000")
  .option("-r, --range <range>", `data range: ${VALID_RANGES.join(", ")}`, "1y")
  .action(async (symbol: string, options: { strategy: string; capital: string; range: string }) => {
    const yahoo = new YahooFinanceService();
    const engine = new BacktestEngine();
    const capital = parseFloat(options.capital);

    if (!VALID_RANGES.includes(options.range)) {
      console.error(
        chalk.red(`Invalid range "${options.range}". Valid values: ${VALID_RANGES.join(", ")}`),
      );
      process.exit(1);
    }

    console.log(chalk.bold(`\nBacktesting ${symbol.toUpperCase()} (${options.range})...\n`));

    try {
      const prices = await yahoo.getHistoricalPrices(symbol.toUpperCase(), options.range);
      if (prices.length === 0) {
        console.error(chalk.red("No price data found."));
        process.exit(1);
      }

      const strategy = (data: DailyPrice[], idx: number) => {
        if (options.strategy === "sma_crossover") {
          return smaCrossover(data, idx);
        }
        return idx === 0 ? "BUY" : "HOLD";
      };

      const result = engine.run(prices, capital, strategy);

      console.log(`${chalk.dim("Initial capital:")}  ₹${result.initialCapital.toLocaleString()}`);
      console.log(
        `${chalk.dim("Final capital:")}    ₹${Math.round(result.finalCapital).toLocaleString()}`,
      );
      console.log(
        `${chalk.dim("Total return:")}     ${result.totalReturn >= 0 ? chalk.green("+") : chalk.red("")}${result.totalReturn.toFixed(2)}%`,
      );
      console.log(`${chalk.dim("Max drawdown:")}     ${chalk.red(result.maxDrawdown.toFixed(2))}%`);
      console.log(`${chalk.dim("Total trades:")}     ${result.trades.length}`);
      console.log(
        `${chalk.dim("Win rate:")}         ${chalk.cyan(`${result.winRate.toFixed(1)}%`)}`,
      );
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("screen")
  .description("Run a screener")
  .option("--min-mc <value>", "minimum market cap (₹ crore)")
  .option("--max-mc <value>", "maximum market cap (₹ crore)")
  .option("--min-pe <value>", "minimum PE ratio")
  .option("--max-pe <value>", "maximum PE ratio")
  .option("--min-roi <value>", "minimum return on equity")
  .option("--max-de <value>", "maximum debt to equity")
  .action(async (_options) => {
    console.log(chalk.bold("\nScreening: This requires fundamental data setup.\n"));
    console.log(chalk.dim("Configure a data source or use --help for details."));
  });

function formatMarketCap(mc: number | undefined): string {
  if (mc == null) return "—";
  if (mc >= 100000) return `${(mc / 100000).toFixed(1)}L Cr`;
  if (mc >= 1000) return `${(mc / 1000).toFixed(0)}K Cr`;
  return `${mc.toFixed(0)} Cr`;
}

program
  .command("personalities")
  .description("Screen the NIFTY 50 universe by investor personality")
  .option("-p, --personality <id>", "filter to one personality (buffett, munger, ...)")
  .action(async (options: { personality?: string }) => {
    const personalities =
      options.personality !== undefined
        ? PERSONALITIES.filter((p) => p.id === options.personality)
        : PERSONALITIES;

    if (personalities.length === 0) {
      console.error(
        chalk.red(
          `Unknown personality '${options.personality}'. Valid: ${PERSONALITIES.map((p) => p.id).join(", ")}`,
        ),
      );
      process.exit(1);
    }

    const universe = mergeFundamentals(await getLiveNifty50Fundamentals());
    console.log(chalk.dim("Fetching live fundamentals..."));
    console.log(chalk.bold(`\nNIFTY 50 universe: ${universe.length} stocks\n`));

    for (const p of personalities) {
      const matched = universe.filter(p.filter);
      console.log(chalk.bold.blue(`\n${p.name}`));
      console.log(chalk.dim(`  ${p.description}`));
      console.log(chalk.dim(`  Matches: ${matched.length}/${universe.length}\n`));
      for (const s of matched) {
        console.log(
          `  ${chalk.white(s.symbol.padEnd(14))} ${formatMarketCap(s.marketCap).padEnd(9)} PE ${String(s.peRatio ?? "—").padEnd(6)} ROE ${String(s.roe ?? "—").padEnd(6)} ${s.sector ?? ""}`,
        );
      }
      if (matched.length === 0) {
        console.log(chalk.dim("  (no matches)"));
      }
    }
  });

program
  .command("journal")
  .description("Trade journal commands")
  .option("-l, --list", "list all journal entries")
  .option("--add", "add a new entry (interactive)")
  .action(async (options) => {
    const db = new DatabaseService();

    if (options.add) {
      const inquirer = (await import("inquirer")).default;
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "symbol",
          message: "Symbol:",
          validate: (v: string) => v.length > 0,
        },
        { type: "list", name: "action", message: "Action:", choices: ["BUY", "SELL"] },
        { type: "number", name: "price", message: "Price:", validate: (v: number) => v > 0 },
        { type: "number", name: "quantity", message: "Quantity:", validate: (v: number) => v > 0 },
        { type: "input", name: "notes", message: "Notes (optional):" },
      ]);
      db.addJournalEntry({
        id: randomUUID(),
        symbol: answers.symbol.toUpperCase(),
        date: new Date().toISOString(),
        action: answers.action,
        price: answers.price,
        quantity: answers.quantity,
        notes: answers.notes || undefined,
      });
      console.log(chalk.green("\nEntry saved."));
    } else {
      const entries = db.getJournalEntries();
      if (entries.length === 0) {
        console.log(chalk.yellow("\nNo journal entries yet."));
      } else {
        console.log(chalk.bold(`\nTrade Journal (${entries.length} entries)\n`));
        entries.forEach((e) => {
          const color = e.action === "BUY" ? chalk.green : chalk.red;
          console.log(
            `${color(e.date.split("T")[0])}  ${chalk.bold(e.symbol)}  ${color(e.action)}  ${e.quantity} @ ₹${e.price}`,
          );
          if (e.notes) console.log(`    ${chalk.dim(e.notes)}`);
        });
      }
    }
    db.close();
  });

program
  .command("insight <symbol>")
  .description("Generate an AI insight using local Ollama")
  .option("-m, --model <name>", "Ollama model to use")
  .action(async (symbol: string, options: { model?: string }) => {
    const ollama = new OllamaService();
    console.log(chalk.bold("\nChecking local Ollama...\n"));

    if (!(await ollama.isRunning())) {
      console.error(chalk.red("Ollama is not running. Start it with `ollama serve`."));
      process.exit(1);
    }

    const models = await ollama.listModels();
    if (models.length === 0) {
      console.error(chalk.red("No models installed. Run `ollama pull llama3` first."));
      process.exit(1);
    }

    const model = options.model ?? models[0].name;
    console.log(chalk.dim(`Using model: ${model}\n`));

    const fundamentals = await new YahooFinanceService().getFundamentals(symbol.toUpperCase());
    const insight = await ollama.generateInsight(model, symbol.toUpperCase(), fundamentals);
    console.log(insight);
  });

program
  .command("auth")
  .description("Authenticate with FYERS for live trading")
  .option("--app-id <id>", "FYERS app ID")
  .option("--secret <secret>", "FYERS secret key")
  .option("--redirect <url>", "redirect URI")
  .option("--code <code>", "auth code from redirect URL")
  .action((options) => {
    if (!options.appId || !options.secret || !options.redirect) {
      console.error(chalk.red("Provide --app-id, --secret, and --redirect."));
      process.exit(1);
    }
    const client = new FyersClient({
      appId: options.appId,
      secretKey: options.secret,
      redirectUri: options.redirect,
    });
    console.log(chalk.bold("\n1. Open this URL in your browser:"));
    console.log(chalk.cyan(`   ${client.getAuthUrl()}\n`));
    console.log(
      chalk.dim("2. After authorizing, you'll be redirected. Copy the `auth_code` value."),
    );
    if (options.code) {
      client
        .authenticate(options.code)
        .then(() => {
          console.log(chalk.green("\nAuthenticated successfully!"));
        })
        .catch((err) => {
          console.error(chalk.red(`\nAuth failed: ${err.message}`));
          process.exit(1);
        });
    }
  });

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}
