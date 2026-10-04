const HandleCastError = (err) => ({
  statusCode: 400,
  message: "Invalid ID",
  errorSources: [{ path: err.path, message: "Invalid value" }],
});

export default HandleCastError;
