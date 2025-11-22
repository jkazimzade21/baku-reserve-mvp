"""
Multi-stop route optimization using TSP algorithms.

This module implements route optimization for visiting multiple locations
efficiently using various algorithms including nearest neighbor and 2-opt.
"""

import itertools
import logging
import math
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Location:
    """A location to visit in the route."""

    id: str
    name: str
    latitude: float
    longitude: float
    visit_duration_minutes: int = 30
    priority: int = 1  # Higher priority = visit earlier
    time_window: tuple[int, int] | None = None  # (open_hour, close_hour)


@dataclass
class OptimizedRoute:
    """Optimized multi-stop route result."""

    locations: list[Location]  # In optimal order
    total_distance_km: float
    total_duration_minutes: int
    travel_time_minutes: int
    visit_time_minutes: int
    route_segments: list[dict[str, Any]]
    optimization_method: str
    savings_km: float  # Distance saved vs naive order
    savings_percentage: float


class MultiStopOptimizer:
    """
    Optimize routes for visiting multiple locations.

    Algorithms:
    - Nearest Neighbor: Fast greedy approach
    - 2-Opt: Local optimization improvement
    - Genetic Algorithm: For larger problems
    """

    def __init__(self, route_type: str = "fastest"):
        """
        Initialize route optimizer.

        Args:
            route_type: Type of routing (fastest, shortest, pedestrian)
        """
        self.route_type = route_type
        self._distance_cache: dict[tuple[str, str], float] = {}
        self._duration_cache: dict[tuple[str, str], int] = {}

    def optimize_route(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None = None,
        algorithm: str = "auto",
        return_to_start: bool = False,
    ) -> OptimizedRoute:
        """
        Optimize a multi-stop route.

        Args:
            start: Starting location
            destinations: Locations to visit
            end: Ending location (if different from start)
            algorithm: Optimization algorithm (auto, nearest, 2opt, genetic)
            return_to_start: Whether to return to start at end

        Returns:
            Optimized route with visit order
        """
        if not destinations:
            raise ValueError("At least one destination required")

        # Choose algorithm based on problem size
        if algorithm == "auto":
            if len(destinations) <= 5:
                algorithm = "brute_force"  # Exact solution for small problems
            elif len(destinations) <= 15:
                algorithm = "2opt"
            else:
                algorithm = "genetic"

        # Build distance matrix
        all_locations = [start] + destinations
        if end and end != start:
            all_locations.append(end)

        self._build_distance_matrix(all_locations)

        # Optimize based on algorithm
        if algorithm == "brute_force" and len(destinations) <= 8:
            result = self._optimize_brute_force(start, destinations, end, return_to_start)
        elif algorithm == "nearest":
            result = self._optimize_nearest_neighbor(start, destinations, end, return_to_start)
        elif algorithm == "2opt":
            result = self._optimize_2opt(start, destinations, end, return_to_start)
        elif algorithm == "genetic":
            result = self._optimize_genetic(start, destinations, end, return_to_start)
        else:
            # Default to nearest neighbor
            result = self._optimize_nearest_neighbor(start, destinations, end, return_to_start)

        # Calculate savings
        naive_distance = self._calculate_naive_distance(start, destinations, end, return_to_start)
        result.savings_km = naive_distance - result.total_distance_km
        result.savings_percentage = (
            (result.savings_km / naive_distance * 100) if naive_distance > 0 else 0
        )

        return result

    def _build_distance_matrix(self, locations: list[Location]) -> None:
        """Build distance matrix between all locations."""
        for i, loc1 in enumerate(locations):
            for j, loc2 in enumerate(locations):
                if i != j:
                    key = (loc1.id, loc2.id)
                    if key not in self._distance_cache:
                        # Use straight-line distance; external routing providers removed.
                        distance = self._haversine_distance(
                            loc1.latitude, loc1.longitude, loc2.latitude, loc2.longitude
                        )
                        self._distance_cache[key] = distance
                        self._duration_cache[key] = int(distance * 2)  # rough minutes estimate

    def _optimize_brute_force(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
    ) -> OptimizedRoute:
        """Find optimal route using brute force (exact solution)."""
        best_order = None
        best_distance = float("inf")

        # Try all permutations
        for perm in itertools.permutations(destinations):
            distance = self._calculate_route_distance(start, list(perm), end, return_to_start)
            if distance < best_distance:
                best_distance = distance
                best_order = list(perm)

        return self._build_route_result(start, best_order, end, return_to_start, "brute_force")

    def _optimize_nearest_neighbor(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
    ) -> OptimizedRoute:
        """Optimize using nearest neighbor heuristic."""
        unvisited = destinations.copy()
        route = []
        current = start

        # Build route greedily
        while unvisited:
            # Find nearest unvisited location
            nearest = min(unvisited, key=lambda loc: self._get_distance(current.id, loc.id))
            route.append(nearest)
            unvisited.remove(nearest)
            current = nearest

        return self._build_route_result(start, route, end, return_to_start, "nearest_neighbor")

    def _optimize_2opt(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
    ) -> OptimizedRoute:
        """Optimize using 2-opt local search."""
        # Start with nearest neighbor solution
        initial = self._optimize_nearest_neighbor(start, destinations, end, return_to_start)

        route = initial.locations[1:-1] if end else initial.locations[1:]
        improved = True

        while improved:
            improved = False
            for i in range(len(route) - 1):
                for j in range(i + 2, len(route)):
                    # Try swapping edges
                    new_route = route[: i + 1] + route[i + 1 : j + 1][::-1] + route[j + 1 :]

                    old_distance = self._calculate_route_distance(
                        start, route, end, return_to_start
                    )
                    new_distance = self._calculate_route_distance(
                        start, new_route, end, return_to_start
                    )

                    if new_distance < old_distance:
                        route = new_route
                        improved = True
                        break
                if improved:
                    break

        return self._build_route_result(start, route, end, return_to_start, "2opt")

    def _optimize_genetic(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
        population_size: int = 50,
        generations: int = 100,
    ) -> OptimizedRoute:
        """Optimize using genetic algorithm for large problems."""
        import random

        def create_individual():
            """Create random route."""
            return random.sample(destinations, len(destinations))

        def fitness(individual):
            """Calculate fitness (negative distance)."""
            distance = self._calculate_route_distance(start, individual, end, return_to_start)
            return -distance  # Minimize distance

        def crossover(parent1, parent2):
            """Order crossover (OX)."""
            size = len(parent1)
            start_idx = random.randint(0, size - 2)
            end_idx = random.randint(start_idx + 1, size)

            child = [-1] * size
            child[start_idx:end_idx] = parent1[start_idx:end_idx]

            pointer = end_idx
            for loc in parent2[end_idx:] + parent2[:end_idx]:
                if loc not in child:
                    child[pointer % size] = loc
                    pointer += 1

            return child

        def mutate(individual, rate=0.01):
            """Swap mutation."""
            if random.random() < rate:
                i, j = random.sample(range(len(individual)), 2)
                individual[i], individual[j] = individual[j], individual[i]
            return individual

        # Initialize population
        population = [create_individual() for _ in range(population_size)]

        # Evolve
        for _generation in range(generations):
            # Evaluate fitness
            fitness_scores = [(fitness(ind), ind) for ind in population]
            fitness_scores.sort(reverse=True)

            # Select best individuals
            elite_size = population_size // 4
            new_population = [ind for _, ind in fitness_scores[:elite_size]]

            # Crossover and mutation
            while len(new_population) < population_size:
                parent1 = fitness_scores[random.randint(0, elite_size - 1)][1]
                parent2 = fitness_scores[random.randint(0, elite_size - 1)][1]
                child = crossover(parent1, parent2)
                child = mutate(child, rate=0.1)
                new_population.append(child)

            population = new_population

        # Return best solution
        best = max(population, key=fitness)
        return self._build_route_result(start, best, end, return_to_start, "genetic")

    def _calculate_route_distance(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
    ) -> float:
        """Calculate total distance for a route."""
        total = 0
        current = start

        for dest in destinations:
            total += self._get_distance(current.id, dest.id)
            current = dest

        if return_to_start:
            total += self._get_distance(current.id, start.id)
        elif end:
            total += self._get_distance(current.id, end.id)

        return total

    def _calculate_naive_distance(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
    ) -> float:
        """Calculate distance for naive (original) order."""
        return self._calculate_route_distance(start, destinations, end, return_to_start)

    def _build_route_result(
        self,
        start: Location,
        destinations: list[Location],
        end: Location | None,
        return_to_start: bool,
        method: str,
    ) -> OptimizedRoute:
        """Build the final route result."""
        # Build complete location list
        locations = [start] + destinations
        if return_to_start:
            locations.append(start)
        elif end:
            locations.append(end)

        # Calculate totals
        total_distance = 0
        total_travel_time = 0
        route_segments = []

        for i in range(len(locations) - 1):
            loc1 = locations[i]
            loc2 = locations[i + 1]
            distance = self._get_distance(loc1.id, loc2.id)
            duration = self._get_duration(loc1.id, loc2.id)

            total_distance += distance
            total_travel_time += duration

            route_segments.append(
                {
                    "from": loc1.name,
                    "to": loc2.name,
                    "distance_km": distance,
                    "duration_minutes": duration,
                }
            )

        # Add visit times
        total_visit_time = sum(loc.visit_duration_minutes for loc in destinations)
        total_duration = total_travel_time + total_visit_time

        return OptimizedRoute(
            locations=locations,
            total_distance_km=total_distance,
            total_duration_minutes=total_duration,
            travel_time_minutes=total_travel_time,
            visit_time_minutes=total_visit_time,
            route_segments=route_segments,
            optimization_method=method,
            savings_km=0,  # Calculated later
            savings_percentage=0,
        )

    def _get_distance(self, from_id: str, to_id: str) -> float:
        """Get cached distance between locations."""
        return self._distance_cache.get((from_id, to_id), 0)

    def _get_duration(self, from_id: str, to_id: str) -> int:
        """Get cached duration between locations."""
        return self._duration_cache.get((from_id, to_id), 0)

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate straight-line distance in km."""
        R = 6371  # Earth radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c


__all__ = [
    "Location",
    "OptimizedRoute",
    "MultiStopOptimizer",
]
