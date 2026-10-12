# Showdown frame foreground

Generated with built-in imagegen from the bundled Village Showdown background, with transparent output. The background itself is unchanged.

Prompt: Extract only the blue wooden frame, four brass corner bolts and a narrow irregular ivory paper rim. Keep the original canvas and layout. Make the blank center and all scenery outside the frame transparent. Preserve wood grain, lighting and paper texture; no new text or props.

The cutout has true alpha. Generation slightly shifted the frame, so `catalog.json` registers the extracted frame bounds to the original painting. Runtime uses the cutout alpha only and samples every visible colour from the original background. This keeps the original art aligned and avoids doubling a repainted frame. The native layer ignores mouse input.
