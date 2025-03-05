import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ["**/*.{js,mjs,cjs,ts}"] },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            // Turn off the no-explicit-any rule
            "@typescript-eslint/no-explicit-any": "off"

            // Or set it to warn instead of error
            // "@typescript-eslint/no-explicit-any": "warn"
        }
    }
];
