import { validateContracts } from "./lib/contracts.js";
import { contracts } from "./contracts/install.js";

function printErrors(): never {
  const errors = validateContracts(contracts);
  if (errors.length === 0) {
    console.log("Contracts are valid.");
    process.exit(0);
  }

  for (const error of errors) {
    console.error(`[${error.check}] ${error.id} (${error.type}) at ${error.filePath}`);
    console.error(`  ${error.message}`);
  }
  process.exit(1);
}

printErrors();
