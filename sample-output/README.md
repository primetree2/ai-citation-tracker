# My reproducible original outputs

I generated `original-evidence.json` and `original-evidence.csv` from the two supplied saved-chat files using the shared parser. I reproduce 29 retrieved / 7 cited for ChatGPT and 9 retrieved / 7 cited for Claude. I have zero **observable query entries** for ChatGPT and one for Claude; I do not interpret the missing ChatGPT entries as zero searches.

I treat these as saved-chat results, not live-stream evidence. I retain only metadata actually mapped from the supplied records. I can regenerate either platform through `node runner/parse.cjs sample-data/chatgpt_raw.json`, with `--csv` for CSV. I can load the combined JSON back into Add data.
