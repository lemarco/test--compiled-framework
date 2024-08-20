const body = { email: z.string() };
const handler = (ctx) => {
	console.log(ctx.body);
};
