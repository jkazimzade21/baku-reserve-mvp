import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

const DEFAULT_HEIGHT = 780;

export type ScrollBudgetSection = {
  key: string;
  render: () => React.ReactNode;
  estimatedHeight: number;
};

export type ScrollBudgetProps = {
  sections: ScrollBudgetSection[];
  maxScreens?: number;
  onOverflow?: (hiddenCount: number) => void;
  overflowIndicator?: (hiddenCount: number) => React.ReactNode;
};

export const HOME_SCROLL_BUDGET_SCREENS = 2;
export const MAX_HOME_SECTIONS = 5; // Context + Search + Hero + My Bookings + Featured Experiences

export default function ScrollBudget({
  sections,
  maxScreens = HOME_SCROLL_BUDGET_SCREENS,
  onOverflow,
  overflowIndicator,
}: ScrollBudgetProps) {
  const { height } = useWindowDimensions();
  const budgetPx = useMemo(() => {
    const screenHeight = Number.isFinite(height) && height ? height : DEFAULT_HEIGHT;
    return screenHeight * Math.max(1, maxScreens);
  }, [height, maxScreens]);

  const allowed: ScrollBudgetSection[] = [];
  let used = 0;
  let hiddenCount = 0;

  sections.forEach((section) => {
    const estimated = Math.max(1, section.estimatedHeight);
    if (used + estimated <= budgetPx) {
      allowed.push(section);
      used += estimated;
    } else {
      hiddenCount += 1;
    }
  });

  useEffect(() => {
    if (hiddenCount > 0 && onOverflow) {
      onOverflow(hiddenCount);
    }
  }, [hiddenCount, onOverflow]);

  return (
    <View style={styles.wrapper} testID="scroll-budget">
      {allowed.map((section) => (
        <View key={section.key} accessible={false}>
          {section.render()}
        </View>
      ))}
      {hiddenCount > 0 && overflowIndicator ? overflowIndicator(hiddenCount) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
});
