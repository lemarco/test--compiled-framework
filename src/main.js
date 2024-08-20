import fs from "node:fs";
import path from "node:path";
import z from "zod";
import vm from "node:vm";

function collectAndProcessFiles(directory) {
	const contentMap = new Map();
	const functionMap = new Map();

	traverseDirectory(directory, (fileName, content) => {
		const { processedContent, executableFunction } =
			processFileContent(content);
		contentMap.set(fileName, processedContent);
		functionMap.set(fileName, executableFunction);
	});

	return { contentMap, functionMap };
}

function traverseDirectory(dir, fileCallback) {
	const files = fs.readdirSync(dir);
	for (const file of files) {
		const fullPath = path.join(dir, file);
		const stat = fs.statSync(fullPath);
		if (stat.isDirectory()) {
			traverseDirectory(fullPath, fileCallback);
		} else if (stat.isFile() && path.extname(file) === ".js") {
			const fileName = path.basename(file, ".js");
			const content = fs.readFileSync(fullPath, "utf8");
			fileCallback(fileName, content);
		}
	}
}

function processFileContent(content) {
	const { bodyContent, handlerContent } = extractContentParts(content);
	console.log(
		"bodyContent, handlerContent",
		bodyContent,
		handlerContent.join(" "),
	);

	const processedContent = generateProcessedContent(
		bodyContent,
		handlerContent,
	);
	const executableFunction = createExecutableFunction(
		bodyContent,
		handlerContent,
	);
	return { processedContent, executableFunction };
}

function extractContentParts(content) {
	const lines = content.split("\n");
	let bodyContent = null;
	let handlerContent = [];
	let isInHandler = false;

	for (const line of lines) {
		if (line.trim().startsWith("const body =")) {
			bodyContent = line.split("=")[1].trim().slice(0, -1); // Remove semicolon
		} else if (line.trim().startsWith("const handler =")) {
			isInHandler = true;
			handlerContent.push(line);
		} else if (isInHandler) {
			handlerContent.push(line);
		}
	}

	return { bodyContent, handlerContent };
}

function generateProcessedContent(bodyContent, handlerContent) {
	let newContent = [];
	if (bodyContent) {
		newContent.push(`const bodySchema = ${bodyContent};`);
	}
	newContent = newContent.concat(handlerContent);
	return newContent.join("\n");
}

function createExecutableFunction(bodyContent, handlerContent) {
	try {
		const context = {
			z,
			body: null,
			handler: null,
			console: console,
		};

		const script = new vm.Script(`
            ${bodyContent ? `const body = ${bodyContent};` : ""}
            ${handlerContent.join("\n")}
            module.exports = { body, handler };
        `);

		const exports = {};
		script.runInNewContext({ ...context, module: { exports } });

		const { body, handler } = exports;

		return async (ctx = {}) => {
			ctx = ctx || {};

			if (body) {
				try {
					const parsedBody = await z.object(body).parseAsync(ctx.rawBody);
					ctx.body = parsedBody;
				} catch (error) {
					ctx.status = 400;
					ctx.body = { error: "Invalid request body", details: error.errors };
					return ctx;
				}
			}
			return handler(ctx);
		};
	} catch (error) {
		console.error(`Error creating executable function: ${error.message}`);
		return null;
	}
}

// Usage example:
const { contentMap, functionMap } = collectAndProcessFiles("./src/handlers");
console.log(contentMap);
console.log(functionMap);

for (const [name, fn] of functionMap) {
	console.log("Executing function", name);
	if (fn) {
		const result = await fn({ rawBody: { email: "example@gmail.com" } });
		console.log("Result:", result);
	} else {
		console.log("Function is null, skipping execution");
	}
}

export { collectAndProcessFiles };
