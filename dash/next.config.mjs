/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");

/** @type {import("next").NextConfig} */
const config = {
	reactStrictMode: false,
	webpack: (
		config,
	) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            "sharp$": false,
            "onnxruntime-node$": false,
        }
		return config
	 },	
};
export default config;
