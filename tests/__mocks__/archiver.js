// Mock di archiver per i test Jest.
// archiver v8 è ESM puro e non compatibile con Jest CJS.
// I test non testano il download ZIP, quindi il mock è sufficiente.
const archiver = () => ({
  pipe:     jest.fn(),
  append:   jest.fn(),
  glob:     jest.fn(),
  finalize: jest.fn().mockResolvedValue(undefined),
  on:       jest.fn().mockReturnThis(),
});
archiver.create = archiver;
module.exports = archiver;
