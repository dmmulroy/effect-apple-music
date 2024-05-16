import { Context, Effect, Layer, Queue, Option } from "effect";
import { MessagePubSub } from "../pubsub/message-pubsub";
import { SpotifyApiClient } from "./spotify-api";
import { SpotifyError } from "./spotify-error";

const make = Effect.gen(function* () {
	yield* Effect.logInfo(`Starting SpotifySongRequestSubscriber`);

	const spotify = yield* SpotifyApiClient;
	const pubsub = yield* MessagePubSub;

	const songRequestSubscriber = yield* pubsub.subscribeTo("SongRequest");

	yield* Effect.forkScoped(
		Effect.forever(
			Effect.gen(function* () {
				const message = yield* Queue.take(songRequestSubscriber);

				const songId = yield* getSongIdFromUrl(message.url).pipe(
					Effect.tapError(Effect.logError),
				);

				yield* spotify
					.use((client) =>
						client.player.addItemToPlaybackQueue(`spotify:track:${songId}`),
					)
					.pipe(Effect.tapError(Effect.logError));
			}).pipe(
				Effect.annotateLogs({
					module: "spotify-currently-playing-request-subscriber",
				}),
			),
		),
	);
	yield* Effect.acquireRelease(
		Effect.logInfo(`SpotifySongRequestSubscriber started`),
		() => Effect.logInfo(`SpotifySongRequestSubscriber stopped`),
	);
}).pipe(
	Effect.annotateLogs({
		module: "spotify-currently-playing-request-subscriber",
	}),
);

export class SpotifySongRequestSubscriber extends Context.Tag(
	"spotify-currently-playing-request-subscriber",
)<SpotifySongRequestSubscriber, never>() {
	static Live = Layer.scopedDiscard(make);
}

const songIdRegex = new RegExp(/\/track\/([a-zA-z0-9]*)/);

function getSongIdFromUrl(url: string): Effect.Effect<string, SpotifyError> {
	return Option.fromNullable(songIdRegex.exec(url)).pipe(
		Option.map(([, songId]) => songId),
		Effect.mapError(
			() => new SpotifyError({ cause: `Invalid song url: ${url}` }),
		),
	);
}
