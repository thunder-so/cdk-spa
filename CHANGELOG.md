# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

-

### Changed

- 

### Removed

-

## [0.19.0]

### Added

- deploy: CacheControl

### Changed

- rootDir and outputDir at root level
- pipeline: cloudfront invalidation changed from /* to /**
- hosting: code refactor

## [0.18.0]

### Added

- errorPagePath

### Changed

- Refactored the CloudFront behaviors (default and static)

### Removed

- handle 403 error was redundant in CloudFront

## [0.17.0]

### Added

- allowHeaders
- allowCookies
- allowQueryParams
- denyQueryParams

## [0.16.0]

### Added

- Supports S3 BucketDeployment
- Pipeline mode optional
- CLI tools for deploy and destroy

### Changed

- Docs updated


## [0.11.0]

### Added

- Redirects
- Rewrites

## [0.6.1] - 2024-08-18

### Changed

- added shelljs

## [0.6.0] - 2024-08-18

### Changed

- Using the OriginAccesscontrol provided by solutions construct instead
