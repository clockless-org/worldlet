# Showdown frame foreground

Generated with built-in imagegen from the bundled Village Showdown background, with transparent output. The board expands almost to the left and bottom canvas edges; the brand cabinet stays above the companion’s open terrace.

Prompt: Extract only the blue wooden frame, four brass corner bolts and a narrow irregular ivory paper rim. Keep the expanded canvas layout, with the frame taking roughly seventy percent of the width and nearly the full height below navigation. Make the blank center and all scenery outside the frame transparent. Preserve wood grain, lighting and paper texture; no new text or props.

The cutout has true alpha. Generation slightly shifted the frame, so `catalog.json` registers the extracted frame bounds to the original painting. Runtime uses the cutout alpha only and samples every visible colour from the original background. This keeps the original art aligned and avoids doubling a repainted frame. The native layer ignores mouse input.

Background edit prompt (built-in imagegen): enlarge the blue board toward the left and bottom image edges and about seventy percent of the width; keep the Village lighting, thin blue rails, brass corner pins and blank cream paper. Preserve the Showdown brand cabinet and flag at upper right. Remove the cushions and open the lower-right terrace for the live companion and dialogue.
