"use client";

import { ReactNode, useEffect, useState } from "react";
import { SocketProvider, useSocket } from "@/context/SocketContext";

import { env } from "@/env.mjs";

import { messageIsInitial, messageIsUpdate } from "@/lib/messageHelpers";

import { type Message } from "@/types/message.type";

import Navbar from "@/components/Navbar";
import SegmentedControls from "@/components/SegmentedControls";
import DelayInput from "@/components/DelayInput";
import Timeline from "@/components/Timeline";
import StreamStatus from "@/components/StreamStatus";
import PlayControls from "@/components/PlayControls";

type Props = {
	children: ReactNode;
};

export default function SocketLayout({ children }: Props) {
	return (
		<SocketProvider>
			<SubLayout>{children}</SubLayout>
		</SocketProvider>
	);
}

const SubLayout = ({ children }: Props) => {
	const { setConnected, updateState, ws, setInitial, setDelay, delay, maxDelay } = useSocket();

	useEffect(() => {
		const socket = new WebSocket(`${env.NEXT_PUBLIC_SOCKET_SERVER_URL}`);

		socket.onclose = () => setConnected(false);
		socket.onopen = () => setConnected(true);

		socket.onmessage = (event) => {
			if (typeof event.data != "string") return;
			const message: Message = JSON.parse(event.data);

			if (Object.keys(message).length === 0) return;

			if (messageIsUpdate(message)) {
				updateState(message);
			}

			if (messageIsInitial(message)) {
				setInitial(message);
			}
		};

		ws.current = socket;

		return () => socket.close();
	}, []);

	const [mode, setMode] = useState<string>("simple");
	const [time, setTime] = useState<number>(0);
	const [pausedTime, setPausedTime] = useState<number>(0);
	const [paused, setPaused] = useState<boolean>(false);

	// useEffect(() => {
	// 	const newDelay = maxDelay - time;
	// 	setDelay(newDelay);
	// }, [time]);

	const togglePaused = () => {
		setPaused((oldState) => {
			// start a timer and count down

			if (oldState) {
				setPausedTime(Date.now());
			}

			return !oldState;
		});
	};

	return (
		<div className="w-full">
			<div className="grid grid-cols-1 items-center border-b border-zinc-800 bg-black p-2 xl:grid-cols-3">
				<Navbar />

				<div className="flex items-center justify-center gap-2">
					<Timeline setTime={setTime} time={time} playing={delay > 0} duration={maxDelay} />
					<StreamStatus live={delay == 0} />
				</div>

				<div className="flex flex-row-reverse items-center gap-1">
					<SegmentedControls
						options={[
							{ label: "Simple", value: "simple" },
							{ label: "Advanced", value: "advanced" },
							{ label: "Expert", value: "expert" },
							{ label: "Custom", value: "custom" },
						]}
						selected={mode}
						onSelect={setMode}
					/>
					{/* TODO implement setting of user prefered delay */}
					<DelayInput setDebouncedDelay={setDelay} />
					<PlayControls playing={!paused} onClick={togglePaused} />
				</div>
			</div>

			<div className="h-max w-full">{children}</div>
		</div>
	);
};
