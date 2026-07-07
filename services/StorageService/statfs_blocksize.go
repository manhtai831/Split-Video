//go:build !linux

package StorageService

import "syscall"

func fsBlockSize(stat *syscall.Statfs_t) int64 {
	return int64(stat.Bsize)
}
