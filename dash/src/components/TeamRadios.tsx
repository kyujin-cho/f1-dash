import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { utc } from "moment";
import clsx from "clsx";

import { sortUtc } from "@/lib/sorting/sortUtc";

import { DriverList, RadioCapture, TeamRadio } from "@/types/state.type";

import TeamRadioMessage from "@/components/TeamRadioMessage";
import { TranscriptionSettings } from "@/context/ModeContext";
import Constants from "@/lib/constants";
import { env } from "@/env.mjs";

type Props = {
	sessionPath: string | undefined;
	drivers: DriverList | undefined;
	teamRadios: TeamRadio | undefined;
};

type TranscriberCompleteData = {
	key: string;
	data: {
		text: string;
		chunks: { text: string; timestamp: [number, number | null] }[];
	};
};

const loadAudioFromRadioCapture = async (
	audioContext: AudioContext,
	path: string,
	retries = 0,
): Promise<Float32Array> => {
	const queryString = new URLSearchParams({ path }).toString();
	try {
		const response = await fetch(`${env.NEXT_PUBLIC_LIVE_SOCKET_URL}/api/audio?${queryString}`);
		if (response.status === 429) throw new Error("met rate limiter");
		const abuf = await response.arrayBuffer();
		const audioData = await audioContext.decodeAudioData(abuf);
		return audioData.getChannelData(0);
	} catch (e) {
		console.warn(e);
		await new Promise<void>((res) => setTimeout(res, 500 * Math.pow(2, retries + 1))); // to deal with possible rate limit violation
		return await loadAudioFromRadioCapture(audioContext, path, retries + 1);
	}
};

export default function TeamRadios({ sessionPath, drivers, teamRadios }: Props) {
	const basePath = `https://livetiming.formula1.com/static/${sessionPath}`;

	// TODO add notice that we only show 20
	const workerRef = useRef<Worker | null>(null);

	const [enableTranscription, setEnableTranscription] = useState<boolean>(false);
	const [transcriptions, setTranscriptions] = useState<{ [key: string]: string }>({});
	const [transcriptionModel, setTranscriptionModel] = useState<string>("");

	const workerEventHandler = (event: MessageEvent) => {
		const message = event.data;
		// Update the state with the result
		switch (message.status) {
			case "complete":
				const completeMessage = message as TranscriberCompleteData;
				const path = message.key;
				if (path) {
					setTranscriptions((oldTranscription) => ({
						...oldTranscription,
						[path]: completeMessage.data.chunks.map((c) => c.text).join("\n"),
					}));
				}
				break;
		}
	};

	const beginTranscripting = async (teamRadios: RadioCapture[]) => {
		const audioContext = new (window.AudioContext || window.webkitAudioContext)({
			sampleRate: Constants.SAMPLING_RATE,
		});

		for (const teamRadio of teamRadios) {
			const audio = await loadAudioFromRadioCapture(audioContext, `${sessionPath}${teamRadio.path}`);
			workerRef.current?.postMessage({
				key: teamRadio.path,
				audio,
				model: transcriptionModel,
				multilingual: false,
				quantized: Constants.DEFAULT_QUANTIZED,
				subtask: null,
				language: null,
			});
			await new Promise((res) => setTimeout(res, 1000)); // To avoid rate limit
		}
	};

	useEffect(() => {
		if (typeof window != undefined) {
			const worker = new Worker(new URL("../asr-worker.js", import.meta.url), {
				type: "module",
			});
			// Listen for messages from the Web Worker
			worker.addEventListener("message", workerEventHandler);
			workerRef.current = worker;

			const transcriptionStorage = localStorage.getItem("transcription");
			const transcriptionSettings: TranscriptionSettings = transcriptionStorage
				? JSON.parse(transcriptionStorage)
				: { enableTranscription: false, whisperModel: "" };

			setEnableTranscription(transcriptionSettings.enableTranscription);
			setTranscriptionModel(transcriptionSettings.whisperModel);
		}
	}, []);

	useEffect(() => {
		if (teamRadios && drivers && teamRadios.captures && enableTranscription && transcriptionModel) {
			const targetRadios = teamRadios.captures.sort(sortUtc).slice(0, 20);

			setTranscriptions((oldTranscriptions) => {
				const newRadios = targetRadios.filter((c) => oldTranscriptions[c.path] === undefined);
				const newTranscriptions = { ...oldTranscriptions };
				newRadios.forEach((c) => (newTranscriptions[c.path] = ""));

				beginTranscripting(newRadios);
				return newTranscriptions;
			});
		}
	}, [teamRadios, drivers, enableTranscription, transcriptionModel]);

	return (
		<ul className="flex flex-col gap-2">
			{!teamRadios && new Array(6).fill("").map((_, index) => <SkeletonMessage key={`radio.loading.${index}`} />)}

			{teamRadios && drivers && teamRadios.captures && (
				<AnimatePresence>
					{teamRadios.captures
						.sort(sortUtc)
						.slice(0, 20)
						.map((teamRadio, i) => (
							<TeamRadioMessage
								key={`radio.${utc(teamRadio.utc).unix()}.${i}`}
								driver={drivers[teamRadio.racingNumber]}
								capture={teamRadio}
								basePath={basePath}
								transcription={transcriptions[teamRadio.path]}
							/>
						))}
				</AnimatePresence>
			)}
		</ul>
	);
}

const SkeletonMessage = () => {
	const animateClass = "h-6 animate-pulse rounded-md bg-zinc-800";

	return (
		<li className="flex flex-col gap-1">
			<div className={clsx(animateClass, "!h-4 w-16")} />

			<div
				className="grid place-items-center items-center gap-4"
				style={{
					gridTemplateColumns: "2rem 20rem",
				}}
			>
				<div className="place-self-start">
					<div className={clsx(animateClass, "!h-8 w-14")} />
				</div>

				<div className="flex items-center gap-4">
					<div className={clsx(animateClass, "h-6 w-6")} />
					<div className={clsx(animateClass, "!h-2 w-60")} />
				</div>
			</div>
		</li>
	);
};
