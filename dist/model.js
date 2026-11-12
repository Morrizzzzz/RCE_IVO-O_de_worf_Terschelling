export function validateAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle < 1 || angle > 89) throw new RangeError('Enter an angle from 1° to 89°.');
  return angle;
}

export function calculateModel(metadata, ditchDistances, ditchAngle, moundAngle) {
  ditchAngle = validateAngle(ditchAngle);
  moundAngle = validateAngle(moundAngle);
  const c = metadata.constants;
  const ds = Math.tan(ditchAngle * Math.PI / 180);
  const ms = Math.tan(moundAngle * Math.PI / 180);
  let ditchVolume = 0;
  for (const distance of ditchDistances) ditchVolume += Math.fround(Math.min(distance * ds, c.ditchDepthCap));
  ditchVolume *= metadata.grid.cellSize ** 2;
  const actualDepth = Math.min(c.ditchWidth / 2 * ds, c.ditchDepthCap);
  const flatWidth = Math.max(0, c.ditchWidth - 2 * c.ditchDepthCap / ds);
  const crossSection = flatWidth > 0
    ? (c.ditchWidth - c.ditchDepthCap / ds) * c.ditchDepthCap
    : 0.5 * c.ditchWidth * actualDepth;
  const moundVolume = ms * c.moundAreaIntegral;
  return {ditchAngle, moundAngle, ditchSlope:ds, moundSlope:ms, ditchVolume, moundVolume,
    height:c.slopeWidth * ms, actualDepth, flatWidth,
    analyticalDitchVolume:crossSection * c.ditchCentrelineLength,
    balance:ditchVolume - moundVolume,
    coverage:ditchVolume / moundVolume * 100};
}

export function reconstructionHeights(moundDistances, ditchDistances, model, cap=1.7) {
  return Float32Array.from(moundDistances, (d,i) => d > 0 ? d * model.moundSlope : -Math.min(ditchDistances[i] * model.ditchSlope, cap));
}
