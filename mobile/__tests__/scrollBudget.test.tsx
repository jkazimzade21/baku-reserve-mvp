import React from 'react';
import { Text, useWindowDimensions } from 'react-native';
import { render } from '@testing-library/react-native';

import ScrollBudget from '../src/components/ScrollBudget';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

const mockedUseDimensions = useWindowDimensions as jest.Mock;

describe('ScrollBudget', () => {
  beforeEach(() => {
    mockedUseDimensions.mockReturnValue({ width: 390, height: 400, scale: 2, fontScale: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders only sections that fit into the budget and surfaces overflow count', () => {
    const overflowSpy = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <ScrollBudget
        sections={[
          { key: 'context', estimatedHeight: 120, render: () => <Text testID="section-context">Context</Text> },
          { key: 'search', estimatedHeight: 160, render: () => <Text testID="section-search">Search</Text> },
          { key: 'hero', estimatedHeight: 220, render: () => <Text testID="section-hero">Hero</Text> },
        ]}
        maxScreens={1}
        onOverflow={overflowSpy}
        overflowIndicator={(hidden) => <Text testID="overflow">Hidden {hidden}</Text>}
      />
    );

    expect(getByTestId('section-context')).toBeTruthy();
    expect(getByTestId('section-search')).toBeTruthy();
    expect(queryByTestId('section-hero')).toBeNull();
    expect(overflowSpy).toHaveBeenCalledWith(1);
    expect(getByTestId('overflow').props.children).toContain(1);
  });
});
