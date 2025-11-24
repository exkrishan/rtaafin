"""Utility functions for error handling, retries, and logging"""

import asyncio
import logging
import uuid
from typing import Optional, Callable, Any, TypeVar, Coroutine
from functools import wraps
import time

logger = logging.getLogger(__name__)

T = TypeVar("T")


def generate_correlation_id() -> str:
    """Generate a unique correlation ID for request tracing"""
    return f"corr-{uuid.uuid4().hex[:12]}"


class RetryableError(Exception):
    """Exception that indicates an operation can be retried"""
    pass


class NonRetryableError(Exception):
    """Exception that indicates an operation should not be retried"""
    pass


async def retry_with_backoff(
    func: Callable[..., Coroutine[Any, Any, T]],
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    retryable_exceptions: tuple = (Exception,),
    correlation_id: Optional[str] = None,
) -> T:
    """
    Retry an async function with exponential backoff
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential backoff
        retryable_exceptions: Tuple of exceptions that should trigger retry
        correlation_id: Optional correlation ID for logging
        
    Returns:
        Result of the function call
        
    Raises:
        Last exception if all retries fail
    """
    corr_id = correlation_id or generate_correlation_id()
    delay = initial_delay
    
    for attempt in range(max_retries + 1):
        try:
            return await func()
        except retryable_exceptions as e:
            if attempt == max_retries:
                logger.error(
                    f"[retry] {corr_id} All {max_retries + 1} attempts failed. "
                    f"Last error: {type(e).__name__}: {str(e)}"
                )
                raise
            
            logger.warning(
                f"[retry] {corr_id} Attempt {attempt + 1}/{max_retries + 1} failed: "
                f"{type(e).__name__}: {str(e)}. Retrying in {delay:.2f}s..."
            )
            
            await asyncio.sleep(delay)
            delay = min(delay * exponential_base, max_delay)
    
    # Should never reach here, but for type safety
    raise Exception("Retry logic error")


def with_correlation_id(func: Callable) -> Callable:
    """Decorator to add correlation ID to function calls"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        corr_id = generate_correlation_id()
        if 'correlation_id' not in kwargs:
            kwargs['correlation_id'] = corr_id
        
        logger.debug(f"[{func.__name__}] {corr_id} Starting execution")
        start_time = time.time()
        
        try:
            result = await func(*args, **kwargs)
            duration = time.time() - start_time
            logger.debug(f"[{func.__name__}] {corr_id} Completed in {duration:.3f}s")
            return result
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"[{func.__name__}] {corr_id} Failed after {duration:.3f}s: "
                f"{type(e).__name__}: {str(e)}"
            )
            raise
    
    return wrapper


class CircuitBreaker:
    """Simple circuit breaker pattern for external service calls"""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exception: type = Exception,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = "closed"  # closed, open, half_open
    
    async def call(self, func: Callable[..., Coroutine[Any, Any, T]], *args, **kwargs) -> T:
        """Execute async function with circuit breaker protection"""
        if self.state == "open":
            if time.time() - (self.last_failure_time or 0) > self.recovery_timeout:
                self.state = "half_open"
                logger.info("[circuit_breaker] Transitioning to half_open state")
            else:
                raise Exception("Circuit breaker is OPEN - service unavailable")
        
        try:
            result = await func(*args, **kwargs)
            if self.state == "half_open":
                self.state = "closed"
                self.failure_count = 0
                logger.info("[circuit_breaker] Service recovered - transitioning to closed")
            return result
        except self.expected_exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
                logger.error(
                    f"[circuit_breaker] Circuit opened after {self.failure_count} failures"
                )
            
            raise

