import { useState } from "react";

import {
  BASE_FONT_SIZE_STEP,
  MAX_BASE_FONT_SIZE,
  MIN_BASE_FONT_SIZE,
} from "../../../../lib/appearancePreferences";
import { SettingsSection } from "../../components/SettingsSection";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";
import {
  AppearancePreviewSeparator,
  TextAppearancePreview,
} from "../components/AppearancePreviews";
import { FontSizeSliderRow } from "../components/FontSizeSliderRow";

export function TextAppearanceSection() {
  const { isReady, appearance, setBaseFontSize } = useAppearancePreferences();
  const [previewFontSize, setPreviewFontSize] = useState<number | null>(null);
  const fontSize = previewFontSize ?? appearance.baseFontSize;

  return (
    <SettingsSection card title="Text">
      <TextAppearancePreview fontSize={fontSize} />
      <AppearancePreviewSeparator />
      <FontSizeSliderRow
        disabled={!isReady}
        icon="textformat.size"
        label="Text size"
        max={MAX_BASE_FONT_SIZE}
        min={MIN_BASE_FONT_SIZE}
        onChange={setBaseFontSize}
        onPreviewChange={setPreviewFontSize}
        step={BASE_FONT_SIZE_STEP}
        value={appearance.baseFontSize}
        valueLabel={`${fontSize} pt`}
      />
    </SettingsSection>
  );
}
