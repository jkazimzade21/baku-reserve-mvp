import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ConciergeAssistantCard from '../src/components/ConciergeAssistantCard';
import type { RestaurantSummary } from '../src/api';

jest.mock('../src/api', () => ({
  CONCIERGE_MODE: 'ai',
  fetchConciergeRecommendations: jest.fn(),
}));

jest.mock('../src/utils/conciergeRecommender', () => ({
  recommendRestaurants: jest.fn(),
}));

jest.mock('../src/utils/photoSources', () => ({
  resolveRestaurantPhotos: () => ({ cover: null, gallery: [] }),
  defaultFallbackSource: { uri: 'placeholder' },
}));

const apiMock = jest.requireMock('../src/api') as {
  fetchConciergeRecommendations: jest.Mock;
  CONCIERGE_MODE: string;
};
const fetchConciergeRecommendations = apiMock.fetchConciergeRecommendations;
const recommendRestaurants = jest.requireMock('../src/utils/conciergeRecommender')
  .recommendRestaurants as jest.Mock;

const sampleRestaurant: RestaurantSummary = {
  id: 'rest-1',
  slug: 'skyline',
  name: 'Skyline Club',
  cuisine: ['International'],
  short_description: 'Skyline vibes for date night.',
  price_level: 'AZN 3/4',
};

describe('ConciergeAssistantCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchConciergeRecommendations.mockResolvedValue({
      results: [],
      match_reason: {},
      explanations: {},
      mode: 'ai',
    });
    recommendRestaurants.mockReturnValue([sampleRestaurant]);
  });

  it('renders API matches with reason chips', async () => {
    fetchConciergeRecommendations.mockResolvedValueOnce({
      results: [sampleRestaurant],
      match_reason: { skyline: ['Romantic', '$$$'] },
      explanations: { skyline: 'Skyline Club keeps the rooftop mood with AZN 3/4 pricing.' },
      mode: 'ai',
    });

    const { getByPlaceholderText, getByText, findByText } = render(
      <ConciergeAssistantCard restaurants={[sampleRestaurant]} onSelect={jest.fn()} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('E.g. Cozy garden dinner for two under 80 AZN'),
      'romantic rooftop',
    );
    fireEvent.press(getByText('Show matches'));

    await waitFor(() => expect(fetchConciergeRecommendations).toHaveBeenCalled());
    expect(await findByText('Romantic')).toBeTruthy();
    expect(getByText('$$$')).toBeTruthy();
    expect(getByText('Skyline Club keeps the rooftop mood with AZN 3/4 pricing.')).toBeTruthy();
  });

  it('falls back to on-device matches when API fails', async () => {
    fetchConciergeRecommendations.mockRejectedValueOnce(new Error('offline'));
    const { getByPlaceholderText, getByText, findByText } = render(
      <ConciergeAssistantCard restaurants={[sampleRestaurant]} onSelect={jest.fn()} />,
    );

    fireEvent.changeText(
      getByPlaceholderText('E.g. Cozy garden dinner for two under 80 AZN'),
      'family brunch',
    );
    fireEvent.press(getByText('Show matches'));

    await waitFor(() => expect(recommendRestaurants).toHaveBeenCalled());
    expect(await findByText('Using on-device matches while Concierge reconnects.')).toBeTruthy();
  });
});
